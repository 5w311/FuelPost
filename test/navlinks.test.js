// Navigation hand-off: URL builders, address formatting, platform gate.
// Rows are real DATA shapes — the point is that coordinates, not addresses,
// reach the nav app.
const { appleMapsUrl, googleMapsUrl, formatStationAddress, isApplePlatform } = require('../lib/navlinks.js');
let p = 0, f = 0;
const ok = (n, c, e = '') => { c ? (p++, console.log('  PASS', n)) : (f++, console.log('  FAIL', n, e)); };

// TA Brookville, straight out of DATA.
const row = ["PA2","TA","TA Brookville","245 Allegheny Boulevard","Brookville","PA","15825",
  "I-80, Exit 78","(814) 849-3051",41.1733,-79.0988,"prim",221,1,8,6,"B,T","",1,1,"CVENTA003"];
// A name with punctuation, also real.
const petro = ["TX7","Petro","Petro Carl's Corner","101 Cornelius Road North","Hillsboro","TX","76645",
  "I-35E, Exit 368","(254) 714-3000",32.0769,-97.0545,"prim",300,1,12,8,"W,T","",1,1,"CVENPE300"];

console.log('=== coordinates are the destination, and they match the row ===');
const a = appleMapsUrl(row), g = googleMapsUrl(row);
ok('apple daddr carries the row lat,lng', a.includes('daddr=41.1733,-79.0988'), a);
ok('google destination carries the row lat,lng', g.includes('destination=41.1733,-79.0988'), g);
ok('the two agree on the coordinate',
   /daddr=([^&]+)/.exec(a)[1] === /destination=([^&]+)/.exec(g)[1]);
ok('>>> the street address never appears in either URL — that is the bug this avoids',
   !a.includes('Allegheny') && !g.includes('Allegheny'), a + ' | ' + g);
ok('negative longitude survives intact (not dropped or re-signed)',
   a.includes('-79.0988') && g.includes('-79.0988'));

console.log('\n=== names are encoded, and only where a name belongs ===');
ok('spaces in the station name are encoded, not raw',
   appleMapsUrl(row).includes('q=TA%20Brookville') || appleMapsUrl(row).includes('q=TA+Brookville'),
   appleMapsUrl(row));
ok('no raw space reaches the URL', !appleMapsUrl(row).includes(' '));
// encodeURIComponent deliberately leaves ! ' ( ) * - . _ ~ alone; an
// apostrophe is legal in a query value, so the URL is correct as-is. What
// makes it safe in `href="..."` is HTML-attribute escaping at the
// interpolation point in openSheet (Esc.escapeHtml), pinned structurally in
// renderstructure.test.js — not this layer's job.
ok("an apostrophe in a name stays a legal query value (Petro Carl's Corner)",
   appleMapsUrl(petro).includes("q=Petro%20Carl's%20Corner"), appleMapsUrl(petro));
ok('  and nothing that would break out of a query param gets through',
   !/[<>"&]/.test(/q=([^&]*)/.exec(appleMapsUrl(petro))[1]), appleMapsUrl(petro));
ok('google carries no name at all (no Place ID to match it against)',
   !googleMapsUrl(petro).toLowerCase().includes('carl'), googleMapsUrl(petro));

console.log('\n=== the documented parameter shapes ===');
ok('apple asks for driving directions (dirflg=d)', a.includes('dirflg=d'));
ok('apple uses the maps.apple.com host over https', a.startsWith('https://maps.apple.com/?'));
ok('google uses the Universal URL API (api=1 on /maps/dir/)',
   g.startsWith('https://www.google.com/maps/dir/?api=1'), g);

console.log('\n=== address string: street, city, ST zip ===');
ok('formats the full one-line address',
   formatStationAddress(row) === '245 Allegheny Boulevard, Brookville, PA 15825',
   formatStationAddress(row));
ok('state and zip are separated by a space, not a comma',
   /, PA 15825$/.test(formatStationAddress(row)));
ok('exactly two commas — street, city, then state zip',
   (formatStationAddress(row).match(/,/g) || []).length === 2);

console.log('\n=== platform gate: Apple button only where Apple Maps exists ===');
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  ipadOS13: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
};
ok('iPhone -> Apple', isApplePlatform(UA.iphone) === true);
ok('iPad (pre-13, honest UA) -> Apple', isApplePlatform(UA.ipadOld) === true);
ok('>>> iPadOS 13+ masquerading as Macintosh -> Apple', isApplePlatform(UA.ipadOS13) === true);
ok('>>> desktop Mac -> Apple (macOS ships Maps.app; a touch check would wrongly exclude it)',
   isApplePlatform(UA.macDesktop) === true);
ok('>>> Android phone -> NOT Apple', isApplePlatform(UA.android) === false);
ok('Android tablet -> NOT Apple', isApplePlatform(UA.androidTablet) === false);
ok('Windows desktop -> NOT Apple', isApplePlatform(UA.windows) === false);
// Android UAs contain "AppleWebKit" and "Safari" — the classic false positive.
ok('the AppleWebKit/Safari trap does not fool it',
   isApplePlatform(UA.android) === false && isApplePlatform(UA.androidTablet) === false);
ok('missing/empty UA -> NOT Apple (Google still shows, so nobody is stranded)',
   isApplePlatform('') === false && isApplePlatform(undefined) === false);

console.log('\n=== terminals navigate too (only Call is phone-conditional) ===');
const term = ["TN1","Covenant","Covenant Chattanooga Terminal","400 Birmingham Hwy","Chattanooga","TN","37419",
  "","",35.0193,-85.3467,"term",0,0,0,0,"","",0,0,""];
ok('a terminal row still yields both URLs',
   appleMapsUrl(term).includes('35.0193,-85.3467') && googleMapsUrl(term).includes('35.0193,-85.3467'));
ok('and a usable address line', formatStationAddress(term) === '400 Birmingham Hwy, Chattanooga, TN 37419');

console.log(`\n${p} passed, ${f} failed`);
if (f) process.exitCode = 1;
