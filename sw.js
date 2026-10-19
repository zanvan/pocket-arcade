// Offline cache. build.mjs fills in VERSION, ASSETS and HASHES.
const VERSION = '3e67752ebf';
const CACHE = 'pocket-arcade-' + VERSION;
const ASSETS = [
 "./",
 "./app.css",
 "./icons/apple-touch-icon.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/maskable-512.png",
 "./index.html",
 "./js/core/i18n.js",
 "./js/core/ui.js",
 "./js/data/words.js",
 "./js/games/arrows.js",
 "./js/games/backgammon.js",
 "./js/games/blockblast.js",
 "./js/games/bubbles.js",
 "./js/games/carjam.js",
 "./js/games/chess.js",
 "./js/games/dotsu.js",
 "./js/games/flow.js",
 "./js/games/jigsaw-pictures.js",
 "./js/games/jigsaw.js",
 "./js/games/mahjong.js",
 "./js/games/tetris.js",
 "./js/games/watersort.js",
 "./js/games/wordle.js",
 "./js/i18n/he/arrows.js",
 "./js/i18n/he/backgammon.js",
 "./js/i18n/he/blockblast.js",
 "./js/i18n/he/bubbles.js",
 "./js/i18n/he/carjam.js",
 "./js/i18n/he/chess.js",
 "./js/i18n/he/core.js",
 "./js/i18n/he/dotsu.js",
 "./js/i18n/he/flow.js",
 "./js/i18n/he/jigsaw.js",
 "./js/i18n/he/mahjong.js",
 "./js/i18n/he/tetris.js",
 "./js/i18n/he/watersort.js",
 "./js/i18n/he/wordle.js",
 "./js/logic/arrows.js",
 "./js/logic/backgammon.js",
 "./js/logic/blockblast.js",
 "./js/logic/bubbles.js",
 "./js/logic/carjam.js",
 "./js/logic/chess.js",
 "./js/logic/dotsu.js",
 "./js/logic/flow.js",
 "./js/logic/jigsaw.js",
 "./js/logic/mahjong.js",
 "./js/logic/rng.js",
 "./js/logic/tetris.js",
 "./js/logic/watersort.js",
 "./js/logic/wordle.js",
 "./js/main.js",
 "./manifest.webmanifest"
];
const HASHES = {
 "./": "79dd2e181fd5c0b49e543327353f9faf3df499e560762bfa07f4a93d9cd212a9",
 "./app.css": "39ff5168845ada7d9221641a55d3f379640a19cdfca95c3f65579796b0e6e15c",
 "./icons/apple-touch-icon.png": "35f15b0b8ae933d8b2e1c2b43b9024c5659718cb576e79b68f7dce04b064ddb9",
 "./icons/icon-192.png": "976bd87c9f87e191ed966eb24940aad452b0a429e5f8f6340e3433747ed40449",
 "./icons/icon-512.png": "3fc5949c6c9a6e9b62b31e1d5f7879cf4b83b5c5006f61094dadc2dbb844644e",
 "./icons/maskable-512.png": "5fa233f84bbe768801593336bf01f0e1153bd598ceb339b5f3a189ab0ee788cd",
 "./index.html": "79dd2e181fd5c0b49e543327353f9faf3df499e560762bfa07f4a93d9cd212a9",
 "./js/core/i18n.js": "b9da3f8a0df11443c39da60f442e087cfa84e5728dd802e38066c7456b6b3fd1",
 "./js/core/ui.js": "6bbfc6380679fbe82f5b2b4fe2c9339d5fd52052b1d2574492a50c80eb11c918",
 "./js/data/words.js": "fc51d983ec8f69f2d78a3d6bcf8551850085ef045f88712fc2c8a35a763a7f88",
 "./js/games/arrows.js": "b41b3b1d0f868ec4bb427c7f2c71e16da8e3ea2c311ae850987dbcc743d98f2a",
 "./js/games/backgammon.js": "ce3721eb981e1bedff0b520ded5b493d86149bd980c0db7b60fee11b135f58bd",
 "./js/games/blockblast.js": "8ecd5f04c9136acab4cb3600f2f2b36ae02829031021cec8a99612b244415bb6",
 "./js/games/bubbles.js": "afa932cea39f6dda625a06593d765e71d49faa936681549dc3d5037548fdce93",
 "./js/games/carjam.js": "d61a926a23332e25e625b7a8e2cd58407d80f50774d52f35088692316d94d38e",
 "./js/games/chess.js": "241a5e358dd1afd658d06cbf96418d48ecd382ca25115ea79d0260d7bd589c01",
 "./js/games/dotsu.js": "8e8943cfe06cfaeacae997b60a13771b3bee68121dee9af22ccbebaf8b6bfec7",
 "./js/games/flow.js": "a617f961efb54ab8bd010521b7060a638f53227fa3866432a560c801aa693737",
 "./js/games/jigsaw-pictures.js": "35681a0567497108a6924149de8391e05c5b05c0bea9d8944cfc50979724957a",
 "./js/games/jigsaw.js": "a70cab643b358ef72bd47f242fe7321d571519cbb2fe96e3dc86fd5f26019c3b",
 "./js/games/mahjong.js": "2d9835b5ad1ef77f383797e734ab33655de0e2ea90be7f6e2dc33ad2c36a0c18",
 "./js/games/tetris.js": "7ef44e83b37ea4b62bb9d067c7911c4a85e97eaca3389f91854aed234a99a948",
 "./js/games/watersort.js": "40d9d02ddbd06c10f43157828eaee1be2da39ed646fe8bf0b37ad47b32be91eb",
 "./js/games/wordle.js": "acc7cfa6a9792b83a214bacded4a75cc9eb98170a5fca501c2cbdfbec662fa51",
 "./js/i18n/he/arrows.js": "bdabf346fb46cd20d973363b92c1cb3a76c0cb776506e49a03d15126af7f55ae",
 "./js/i18n/he/backgammon.js": "76489b36a4d0f991ad886cbd4e38c0b73dc9cb7fb26e434bbf71bd3af78be370",
 "./js/i18n/he/blockblast.js": "a44ed8c8c379613603833b93a648e151bbb57a58c9ab65042b59119ffe8ac58d",
 "./js/i18n/he/bubbles.js": "34f8cfc4418d965288d7dfc7316326f8642e5775a19e472049d808c98aa30e5b",
 "./js/i18n/he/carjam.js": "71f4e82b5e7c5af01741bf21429d324a6080b2d7c4b042406cdece7aef293c10",
 "./js/i18n/he/chess.js": "d449e7b523edc8875fd20b87d76772f1a3705038687532a0d44adf01ede4c679",
 "./js/i18n/he/core.js": "aa632490d964cda17f6e1eb9b411c2eec3fd7b39e947d039f58c3d3ba90a6a11",
 "./js/i18n/he/dotsu.js": "1faf5a343dc09d94bd9db887c75f9cbd02bbd80d166ad6733a83e1eb272428db",
 "./js/i18n/he/flow.js": "77693cab49b1f3d733146a24166dcb4336ea6e1ae76524094498d3dd41fc69a8",
 "./js/i18n/he/jigsaw.js": "b00d92cfae6ba7ec770e6a39f9ea771def1ddd9e41179b32c43374af0406dd39",
 "./js/i18n/he/mahjong.js": "50514a1070d2dd9e61e84c2ac5fed4d0d491d6cf9fddc6c20b129a872032485b",
 "./js/i18n/he/tetris.js": "25761ccac8409179279129cdce82918d96e5a63a92ff3dd76e10dc9d8d626fba",
 "./js/i18n/he/watersort.js": "2169e6596e146b6fe2591dc970b77014f71781e4c391c706263b00d70b95f8b1",
 "./js/i18n/he/wordle.js": "e20439ac1cdf66dc00fa445bc3feada191b2ac72fb2bde2ec810c87e6f1f8c00",
 "./js/logic/arrows.js": "5983390d7f4f9dd4c477889bba13cf6ba665a9b1476104a9bb6dd9d608ae751f",
 "./js/logic/backgammon.js": "a443a832a572256420c6546df3d04b37615e7e15de051aa46482b94afd153172",
 "./js/logic/blockblast.js": "bc3e47b34a704cc7914566b734165bf49971d1d68280c3200bb971205583112b",
 "./js/logic/bubbles.js": "8c0797e04a90e8af0e2a67262220fe8d5d43ee211f0dafc74d3b96557ed4b833",
 "./js/logic/carjam.js": "1f5ebe4a309b03ae58563063de36f0f5e7bb453fb5c84c7aeace233d094cf7a5",
 "./js/logic/chess.js": "9fec22f8257198d58e93ba00754711c0c569d6883ff606292c0c209e82beb426",
 "./js/logic/dotsu.js": "45dc7dd218cfc24c9dcb33a6315f3223fecf74c3f3242ed2d9f4b266ce57e43f",
 "./js/logic/flow.js": "a3151ab74276a4bf7832dfe2d4f2928c71edfb8a8c2db2be954caa9ae3c5d050",
 "./js/logic/jigsaw.js": "a882e5afffc2802c17f9ce11a2730811e28749577bc1e744db0ab591e47b67ed",
 "./js/logic/mahjong.js": "d0284acbfcd088fbc4bc2c886a96dc5d51bcc9766ab743f923ccafaa0a724e5e",
 "./js/logic/rng.js": "14698bc2406deadc4f9f5f8a909ccdaf82e46537c7ca14d32ed4a3b3de0c7984",
 "./js/logic/tetris.js": "fdd71b8818d221e2c04f7fd6d1addb1031bd25b5a4e47993d41b4e9cb3e09273",
 "./js/logic/watersort.js": "1cbd01f9db69f0a296fd4e723545ed1de462efc746ef9e8738fc4f8465842f2f",
 "./js/logic/wordle.js": "8d15910b14a21925ad317fa2df1a15adb7e8a251cb26ba20a0cbbda0a91d770b",
 "./js/main.js": "32faa5d9085949371bba1cdc4a7e87228806ed75410e494d887d25579041d9f7",
 "./manifest.webmanifest": "02e2383224a12a8baeac58bda07ccb39f37c1b10c7acc16ccf61791d2a4a954a"
}; // file -> SHA-256 of the copy this version was built with

async function sha256(res) {
  const buf = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Right after a deploy the CDN may still hand out old copies of some files. A version built
// from a mix would break, so every file must match its hash. If one doesn't, the install
// fails, the old version keeps running, and the next update check tries again.
async function install() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
  if (!self.crypto?.subtle) return; // an old phone without hashing still gets its offline copy
  for (const url of ASSETS) {
    const res = await cache.match(url);
    if (!res || (await sha256(res)) !== HASHES[url]) {
      await caches.delete(CACHE);
      throw new Error('stale copy of ' + url);
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(install().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pocket-arcade-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then((r) => r || fetch(req))
  );
});
