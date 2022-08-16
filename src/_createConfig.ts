import fs from 'fs';
import yml from 'yaml';
import path from 'path';

export default function createConfig<T extends any>(configPath: string, defaultData: T): string {
    if (fs.existsSync(configPath)) return fs.readFileSync(configPath, 'utf8');

    const filename = path.extname(configPath);
    const data = typeof defaultData === 'object' && (filename == '.yml' || filename == '.yaml') ? yml.stringify(defaultData) : defaultData;

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, typeof data === 'object' ? JSON.stringify(data, null, 2) : `${data}`);
    if (fs.existsSync(configPath)) return fs.readFileSync(configPath, 'utf8');

    throw new Error(`Failed to create config file at ${configPath}`);
}
