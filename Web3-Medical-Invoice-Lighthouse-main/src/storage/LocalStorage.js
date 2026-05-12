const storage = window.localStorage;

export class Files {
    created: string;
    modified: string;
    name: string;
    content: string;
    password: string;

    constructor(created: string, modified: string, content: string, name: string, password?: string) {
        this.created = created;
        this.modified = modified;
        this.content = content;
        this.name = name;
        this.password = password;
    }
}

export class Local {
    constructor() {
        this.storage = storage;
        this.token = null;
        this.PREFIX = 'Files_Storage_';
    }

    _saveFile(file: Files) {
        let data = {
            created: file.created,
            modified: file.modified,
            content: file.content,
            password: file.password
        };
        this.storage.setItem(`${this.PREFIX}${file.name}`, JSON.stringify(data));
    }

    _getFile(name) {
        const rawData = this.storage.getItem(`${this.PREFIX}${name}`);
        if (!rawData) return null;
        return JSON.parse(rawData);
    }

    _getAllFiles() {
        let arr = {};
        for (let i = 0; i < this.storage.length; i++) {
            const fullKey = this.storage.key(i);
            
            if (fullKey && fullKey.startsWith(this.PREFIX)) {
                try {
                    const fileName = fullKey.slice(this.PREFIX.length);
                    const data = this._getFile(fileName);
                    if (data) {
                        arr[fileName] = data.modified;
                    }
                } catch (e) {
                    console.warn(`Skipping invalid file ${fullKey}`, e);
                }
            }
        }
        return arr;
    }

    _deleteFile(name) {
        this.storage.removeItem(`${this.PREFIX}${name}`);
    }
}