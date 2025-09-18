import { Plugin, FileExplorerView, TFolder, GetSortedFolderItems } from "obsidian";
import { around, dedupe } from "monkey-around";

export default class ScopeToThis extends Plugin {
    private settings!: ScopeToThisSettings;

    async onload() {
        const plugin = this;
        plugin.settings = Object.assign({}, DEFAULT_SETTINGS, await plugin.loadData());

        plugin.app.workspace.onLayoutReady(async () => await plugin.patchFileExplorer());
        plugin.registerEvent(
            plugin.app.workspace.on("layout-change", async () => await plugin.patchFileExplorer())
        );

        plugin.registerEvent(
            plugin.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addSeparator().addItem((item) => {
                        if (file.path != plugin.getPath()) {
                            item.setTitle("Scope to this")
                                .setIcon("pin")
                                .onClick(async () => await plugin.setPath(file.path));
                        } else {
                            item.setTitle("Unscope from this")
                                .setIcon("pin-off")
                                .onClick(async () => await plugin.setPath(""));
                        }
                    });
                }
            })
        );
    }

    onunload() {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        delete fileExplorer[this.getPatchID()];
        fileExplorer.requestSort();
    }

    getFileExplorer(): FileExplorerView | undefined {
        const fileExplorerContainer = this.app.workspace.getLeavesOfType("file-explorer")?.first();
        return fileExplorerContainer?.view as FileExplorerView;
    }

    private async patchFileExplorer() {
        const plugin = this;
        const fileExplorer = plugin.getFileExplorer();

        if (!fileExplorer) throw Error("Could not find file explorer");
        if (fileExplorer[plugin.getPatchID()]) return;

        plugin.register(
            around(Object.getPrototypeOf(fileExplorer), {
                getSortedFolderItems(old: GetSortedFolderItems) {
                    return dedupe(
                        plugin.getPatchID(),
                        old,
                        function (this: FileExplorerView, ...args: Parameters<typeof old>) {
                            const passedInFolder = args[0];
                            if (passedInFolder.isRoot()) {
                                const targetFolder = this.fileItems[plugin.getPath()];
                                if (targetFolder) return [targetFolder];
                            }
                            return old.call(this, ...args);
                        }
                    );
                },
            })
        );

        // Refresh scope target related properties
        await plugin.setPath(plugin.getPath());
        fileExplorer[plugin.getPatchID()] = true;
        fileExplorer.requestSort();
    }

    getPatchID() {
        return this.settings.patchId;
    }

    getPath(): string {
        return this.settings.scopePath;
    }

    async setPath(newPath: string) {
        const fileExplorer = this.getFileExplorer();
        const currentCoverEl = fileExplorer?.fileItems[this.getPath()]?.coverEl;
        const newCoverEl = fileExplorer?.fileItems[newPath]?.coverEl;

        currentCoverEl?.removeAttribute("id");
        this.settings.scopePath = newPath;
        newCoverEl?.setAttribute("id", "scope-target");
        await this.saveData(this.settings);
        fileExplorer?.requestSort();
    }
}

interface ScopeToThisSettings {
    patchId: string;
    scopePath: string;
}

const DEFAULT_SETTINGS: ScopeToThisSettings = {
    patchId: "obsidian-scope-to-this-patch",
    scopePath: "",
};
