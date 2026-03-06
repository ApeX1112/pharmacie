import fs from 'fs';
import path from 'path';

const dir = 'src/screenshots';
const files = fs.readdirSync(dir);

let i = 1;
files.forEach((file) => {
    if (file.includes("Capture d'écran")) {
        const ext = path.extname(file);
        const newName = `screenshot_0${i}${ext}`;
        fs.renameSync(path.join(dir, file), path.join(dir, newName));
        console.log(`Renamed "${file}" to "${newName}"`);
        i++;
    }
});
