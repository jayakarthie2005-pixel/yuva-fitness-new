let fs=require('fs');
let s=fs.readFileSync('franchise/gallery.html','utf8');
console.log('hasNav', s.includes('nav-wrap'));
console.log('hasHero', s.includes('BUILD YOUR'));
console.log('hasGrid', s.includes('id="equipment-grid"'));
console.log('hasCombined', s.includes('COMMERCIAL ARSENAL'));
console.log('hasForm', s.includes('franchiseEnquiry'));
