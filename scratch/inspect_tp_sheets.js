const https = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const sheetId = '14aekvosHk2Xy3Ag_EHfEjHyr9ZDhD34UXHu8Ldqh9Ic';
  const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
  const html = await fetchText(htmlUrl);
  
  const regex = /<li id="sheet-button-[^"]+"><a[^>]+>([^<]+)<\/a>/g;
  let match;
  const sheetNames = [];
  while ((match = regex.exec(html)) !== null) {
    sheetNames.push(match[1]);
  }
  
  console.log('Total tabs found in Teaching Plan Spreadsheet:', sheetNames.length);
  sheetNames.forEach((n, i) => console.log(`${i+1}: "${n}"`));
}

main().catch(console.error);
