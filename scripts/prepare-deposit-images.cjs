// Format conversion only. Preserve the supplied tutorial screenshots and layout.
const fs = require('node:fs/promises');
const sharp = require(process.argv[2]);
const root = 'C:/Users/style/AppData/Local/Temp/browser-use/assets/';
const sources = {
  bitopro: ['baf312b3a504661e','4cc68bbbd03ec642','269c11953e5fa240','d65e4043abea3a26','96302b938c8ff09a','7a885a1c950b4592','c1c070b6e64811de','907e892627619866','e6c85969f764f389','e431dc3662792bab'].map(id=>[root+'7108e05e-5a34-4ce1-93f1-20257cc27a92',id]),
  credit: [
    ['b96c1850-c9cf-4656-9b89-1efae4978f8c','ba0bbd0236ac777e'],['b96c1850-c9cf-4656-9b89-1efae4978f8c','abeb6f34a3a2ece2'],
    ['f1496cb1-75d2-4951-8a36-3defbbf1b146','27c3870e0615d391'],['f1496cb1-75d2-4951-8a36-3defbbf1b146','6ce157509cf7502f'],
    ['726a2972-027a-4a14-83c0-3afe1ef4b2ae','76a6328b25fa0615'],['726a2972-027a-4a14-83c0-3afe1ef4b2ae','48e911e828a1d4f5'],
    ['bedae442-e4b2-4ad4-9f7d-98998b3c90db','1f7875c5fe412fdc'],['bedae442-e4b2-4ad4-9f7d-98998b3c90db','ce6eb30e32860cc8'],
    ['d86483e4-94d1-4644-a29c-562d22abbc84','9f28ff6d030ef374']
  ].map(([directory,id])=>[root+directory,id])
};
(async()=>{
  await fs.mkdir('test-output',{recursive:true});
  for(const [method,items] of Object.entries(sources)) {
    const tiles=[];
    for(const [index,[directory,id]] of items.entries()) {
      const path=`public/guides/${method}-${String(index+1).padStart(2,'0')}.jpg`;
      const publish = method === 'bitopro' ? ![0,3,9].includes(index) : index !== 7;
      if(publish) await sharp(`${directory}/${id}.png`).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(path);
      const image=await sharp(`${directory}/${id}.png`).resize({width:300,height:535,fit:'contain',background:'#f5f5f5'}).toBuffer();
      const label=Buffer.from(`<svg width="300" height="30"><rect width="300" height="30" fill="white"/><text x="12" y="22" font-size="18">${method}-${index+1}</text></svg>`);
      tiles.push({input:image,left:(index%5)*300,top:Math.floor(index/5)*565+30},{input:label,left:(index%5)*300,top:Math.floor(index/5)*565});
    }
    await sharp({create:{width:1500,height:Math.ceil(items.length/5)*565,channels:3,background:'#f5f5f5'}}).composite(tiles).png().toFile(`test-output/${method}-contact.png`);
    console.log(`${method}: ${items.length} original screenshots converted`);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
