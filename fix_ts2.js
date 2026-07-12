const fs = require('fs');
let content = fs.readFileSync('c:/SHT-DATA/badmintoncot/app/admin/page.tsx', 'utf8');

// I will split by lines and remove the exact duplicate line `const [newAdminEmail, setNewAdminEmail] = useState('');`
const lines = content.split('\n');
let newAdminEmailCount = 0;
const newLines = lines.filter(line => {
    if (line.includes("const [newAdminEmail, setNewAdminEmail] = useState('');")) {
        newAdminEmailCount++;
        if (newAdminEmailCount > 1) {
            return false; // remove duplicates
        }
    }
    return true;
});

fs.writeFileSync('c:/SHT-DATA/badmintoncot/app/admin/page.tsx', newLines.join('\n'));
console.log('Removed duplicate newAdminEmail state');
