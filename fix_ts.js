const fs = require('fs');

let content = fs.readFileSync('c:/SHT-DATA/badmintoncot/app/admin/page.tsx', 'utf8');

content = content.replace(
  "const [newAdminEmail, setNewAdminEmailForm] = useState('');\\n",
  ""
);

content = content.replace(
  /newAdminEmailForm/g,
  "newAdminEmail"
);
content = content.replace(
  /setNewAdminEmailForm/g,
  "setNewAdminEmail"
);

fs.writeFileSync('c:/SHT-DATA/badmintoncot/app/admin/page.tsx', content);
console.log('Fixed newAdminEmailForm');
