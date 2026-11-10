// The Brain Teasers puzzles. Each one is a short question with a trick, in one of four kinds:
//   answer.choices  — pick one of the buttons (answer.correct is its index)
//   answer.number   — type the number on the keypad
//   build(sc)       — a little scene to drag and tap; the scene calls sc.win() when it is solved
// A puzzle may have a scene and an answer: the scene is then only a picture.
// The question may hold tokens, made with tok(name, html): tappable parts of the question
// itself (some puzzles hide their answer there). Every text goes through t() (see i18n.js).
//
// The puzzles are original. No wordplay: each trick has to work the same in Hebrew.
import { t } from '../core/i18n.js';

// A face drawn in SVG, so every phone shows exactly the same picture. wink: one eye shut.
function face(wink) {
  return `<svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="20" r="18" fill="#ffd257" stroke="#d99a1e" stroke-width="2"/>
    <circle cx="13.5" cy="16" r="2.6" fill="#3a2a12"/>${wink ? '<path d="M23.5 16.5h6" stroke="#3a2a12" stroke-width="2.4" stroke-linecap="round"/>' : '<circle cx="26.5" cy="16" r="2.6" fill="#3a2a12"/>'}
    <path d="M12 24q8 7 16 0" fill="none" stroke="#3a2a12" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}

const box = (style) => `<div style="width:100%;height:100%;${style}"></div>`;

export const PUZZLES = [
  {
    id: 'apple',
    q: () => t('Put the apple in the basket.'),
    hint: () => t('You can drag things around with your finger.'),
    build(sc) {
      sc.add({ e: '🌳', x: 38, y: 38, s: 62 });
      const apple = sc.add({ e: '🍎', x: 30, y: 30, s: 10, drag: true });
      const basket = sc.add({ e: '🧺', x: 78, y: 82, s: 20 });
      apple.onDrop = () => { if (sc.dist(apple, basket) < 13) { apple.set(78, 78); sc.win(); } else apple.home(); };
    },
  },
  {
    id: 'stars',
    q: (tok) => t('How many {star} are on this screen?', { star: tok('star', '<span style="color:#ffc857">★</span>') }),
    hint: () => t('Count every star you can see. Every single one.'),
    answer: { number: 6 },
    build(sc) {
      for (const [x, y, s] of [[20, 25, 14], [70, 20, 10], [45, 55, 18], [80, 70, 12], [18, 78, 9]]) {
        sc.add({ html: '<span style="color:#ffc857">★</span>', x, y, s });
      }
    },
  },
  {
    id: 'feathers',
    q: () => t('Which is heavier: a kilo of feathers or a kilo of iron?'),
    hint: () => t('Read the question again: how much of each is there?'),
    answer: { choices: () => [t('The feathers'), t('The iron'), t('They weigh the same')], correct: 2 },
    build(sc) { sc.add({ e: '⚖️', x: 50, y: 50, s: 46 }); },
  },
  {
    id: 'odd-face',
    q: () => t('Tap the face that is different.'),
    hint: () => t('Look closely at the eyes.'),
    build(sc) {
      const odd = Math.floor(Math.random() * 25);
      for (let i = 0; i < 25; i++) {
        const it = sc.add({ html: face(i === odd), x: 14 + (i % 5) * 18, y: 14 + Math.floor(i / 5) * 18, s: 15, w: 15, h: 15 });
        it.onTap = () => (i === odd ? sc.win() : sc.wrong());
      }
    },
  },
  {
    id: 'sheep',
    q: () => t('A farmer has 17 sheep. All but 9 run away. How many sheep are left?'),
    hint: () => t('“All but 9” means all of them except 9.'),
    answer: { number: 9 },
    build(sc) { for (const [x, y] of [[25, 35], [55, 30], [80, 45], [35, 65], [68, 70]]) sc.add({ e: '🐑', x, y, s: 17 }); },
  },
  {
    id: 'balloon',
    q: () => t('Help the balloon fly away.'),
    hint: () => t('Something is holding it down.'),
    build(sc) {
      const string = sc.add({ html: box('background:#cfd3df'), x: 50, y: 52, w: 0.6, h: 34, z: 0 });
      const balloon = sc.add({ e: '🎈', x: 50, y: 28, s: 24 });
      const weight = sc.add({ e: '📦', x: 50, y: 76, s: 17, drag: true });
      let free = false;
      balloon.onTap = () => { if (!free) sc.wrong(t('It is tied down.')); };
      weight.onDrop = () => {
        if (free) return;
        if (Math.hypot(weight.x - 50, weight.y - 76) > 14) {
          free = true;
          string.hide();
          balloon.set(50, -30, 1.4);
          sc.win(1200);
        } else weight.home();
      };
    },
  },
  {
    id: 'lines',
    q: () => t('Which line is longer?'),
    hint: () => t('Ignore the arrow ends. Look only at the straight lines.'),
    answer: { choices: () => [t('The top one'), t('The bottom one'), t('Both are the same length')], correct: 2 },
    build(sc) {
      sc.add({
        html: `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="#eef0f7" stroke-width="2.6" stroke-linecap="round">
          <path d="M25 32H75M25 32l8-8M25 32l8 8M75 32l-8-8M75 32l-8 8"/>
          <path d="M25 70H75M25 70l-8-8M25 70l-8 8M75 70l8-8M75 70l8 8"/></svg>`,
        x: 50, y: 50, w: 100, h: 100,
      });
    },
  },
  {
    id: 'key',
    q: () => t('Find the key and open the door.'),
    hint: () => t('Look under things.'),
    build(sc) {
      const door = sc.add({ e: '🚪', x: 78, y: 42, s: 34 });
      sc.add({ e: '🌵', x: 16, y: 52, s: 18, drag: true });
      const key = sc.add({ e: '🔑', x: 40, y: 80, s: 9, z: 1 });
      sc.add({ html: box('background:repeating-linear-gradient(90deg,#b5473a 0 6%,#d9704f 6% 12%);border-radius:1em;box-shadow:0 .6em 1.2em rgba(0,0,0,.35)'), x: 40, y: 80, w: 40, h: 16, z: 2, drag: true });
      door.onTap = () => sc.wrong(t('The door is locked.'));
      key.onTap = () => { key.set(door.x, door.y); sc.win(900); };
    },
  },
  {
    id: 'race',
    q: () => t('In a race, you overtake the runner in second place. What place are you in now?'),
    hint: () => t('You took their place, not the leader’s.'),
    answer: { choices: () => [t('First'), t('Second'), t('Third')], correct: 1 },
    build(sc) { sc.add({ e: '🏃', x: 34, y: 50, s: 30 }); sc.add({ e: '🏁', x: 74, y: 44, s: 26 }); },
  },
  {
    id: 'fridge',
    q: () => t('Put the elephant in the fridge.'),
    hint: () => t('Three steps: open it, put it in, close it.'),
    build(sc) {
      const fridge = sc.add({ html: box('background:#e8edf3;border-radius:1.5em;border:.6em solid #a9b4c2;box-sizing:border-box'), x: 72, y: 52, w: 34, h: 64, z: 1 });
      const elephant = sc.add({ e: '🐘', x: 24, y: 66, s: 26, drag: true, z: 4 });
      const door = sc.add({
        html: box('background:#c9d3de;border-radius:1.5em;border:.6em solid #98a5b5;box-sizing:border-box;position:relative')
          + '<div style="position:absolute;left:12%;top:38%;width:7%;height:22%;background:#6d7a8c;border-radius:1em"></div>',
        x: 72, y: 52, w: 34, h: 64, z: 3,
      });
      door.node.style.transformOrigin = 'right center';
      door.node.style.transition = 'transform .35s';
      let open = false, inside = false;
      door.onTap = () => {
        open = !open;
        door.node.style.transform = open ? 'translate(-50%,-50%) perspective(80em) rotateY(75deg)' : 'translate(-50%,-50%)';
        sc.sound('tap');
        if (!open && inside) sc.win(500);
      };
      elephant.onDrop = () => {
        if (sc.dist(elephant, fridge) > 20) { elephant.home(); return; }
        if (!open) { sc.wrong(t('The door is closed.')); elephant.home(); return; }
        inside = true;
        elephant.drag = false;
        elephant.size(14);
        elephant.set(72, 56);
        elephant.node.style.zIndex = 2;
        sc.sound('place');
      };
    },
  },
  {
    id: 'apples',
    q: () => t('There are 3 apples. You take away 2. How many apples do you have?'),
    hint: () => t('How many did YOU take?'),
    answer: { number: 2 },
    build(sc) { for (const x of [26, 50, 74]) sc.add({ e: '🍎', x, y: 50, s: 18 }); },
  },
  {
    id: 'squares',
    q: () => t('How many squares can you see?'),
    hint: () => t('The big outside square counts too.'),
    answer: { choices: () => ['4', '5', '8', '9'], correct: 1 },
    build(sc) {
      sc.add({ html: '<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="#eef0f7" stroke-width="2.4"><rect x="20" y="20" width="60" height="60"/><path d="M50 20V80M20 50H80"/></svg>', x: 50, y: 50, w: 100, h: 100 });
    },
  },
  {
    id: 'colors',
    q: () => t('Tap the RED button.'),
    hint: () => t('Look at the colour, not at the word.'),
    build(sc) {
      // Each word names a different colour from the button it is on.
      const btns = [
        [() => t('Red'), '#2f6fe0', 30, 32], [() => t('Blue'), '#e0413a', 70, 32],
        [() => t('Green'), '#e8b923', 30, 68], [() => t('Yellow'), '#2aa152', 70, 68],
      ];
      btns.forEach(([label, bg, x, y], i) => {
        const it = sc.add({ html: `<div style="width:100%;height:100%;background:${bg};border-radius:1.2em;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">${label()}</div>`, x, y, w: 34, h: 24, s: 6 });
        it.onTap = () => (i === 1 ? sc.win() : sc.wrong());
      });
    },
  },
  {
    id: 'candle',
    q: () => t('Light the candle.'),
    hint: () => t('A match needs to be struck on its box first.'),
    build(sc) {
      const candle = sc.add({ e: '🕯️', x: 74, y: 58, s: 30 });
      const matchbox = sc.add({ html: box('background:linear-gradient(#e44d3a,#b8321f);border-radius:.8em;border:.5em solid #6e2316;box-sizing:border-box'), x: 26, y: 40, w: 26, h: 15 });
      const match = sc.add({
        html: '<div style="position:relative;width:100%;height:100%"><div style="position:absolute;left:44%;top:12%;width:12%;height:88%;background:#e8c58e;border-radius:.4em"></div>'
          + '<div style="position:absolute;left:36%;top:0;width:28%;height:20%;background:#a3271b;border-radius:50%"></div>'
          + '<div class="flame" style="position:absolute;left:-40%;top:-62%;width:180%;text-align:center;display:none">🔥</div></div>',
        x: 26, y: 74, w: 12, h: 26, s: 9, drag: true,
      });
      let lit = false;
      match.onDrop = () => {
        if (!lit && sc.dist(match, matchbox) < 16) {
          lit = true;
          match.node.querySelector('.flame').style.display = '';
          sc.sound('pop');
          return;
        }
        if (sc.dist(match, candle) < 18) {
          if (!lit) { sc.wrong(t('The match is not lit.')); match.home(); return; }
          sc.add({ e: '🔥', x: 74, y: 36, s: 11 });
          match.hide();
          sc.win(700);
        }
      };
    },
  },
  {
    id: 'rooster',
    q: () => t('A rooster lays an egg on top of a roof. Which side does the egg roll down?'),
    hint: () => t('Who lays eggs, a rooster or a hen?'),
    answer: { choices: () => [t('The left side'), t('The right side'), t('Neither side')], correct: 2 },
    build(sc) { sc.add({ e: '🏠', x: 50, y: 62, s: 50 }); sc.add({ e: '🐓', x: 50, y: 24, s: 20 }); },
  },
  {
    id: 'legs',
    q: () => t('How many legs are there in this picture, all together?'),
    hint: () => t('A bird has 2 legs, a cat has 4. And a spider?'),
    answer: { number: 14 },
    build(sc) { sc.add({ e: '🐦', x: 22, y: 50, s: 20 }); sc.add({ e: '🐈', x: 52, y: 50, s: 22 }); sc.add({ e: '🕷️', x: 80, y: 50, s: 18 }); },
  },
  {
    id: 'balls',
    q: (tok) => t('Find all 4 balls {ball}', { ball: tok('ball', '⚽') }),
    hint: () => t('One of them is not in the picture.'),
    build(sc) {
      let found = 0;
      const got = (node) => {
        if (node.dataset.got) return;
        node.dataset.got = '1';
        found++;
        sc.sound('pop');
        node.style.opacity = '0.3';
        if (found === 4) sc.win();
      };
      for (const [x, y] of [[22, 30], [72, 40], [45, 75]]) {
        const it = sc.add({ e: '⚽', x, y, s: 13 });
        it.onTap = () => got(it.node);
      }
      sc.onToken('ball', got);
    },
  },
  {
    id: 'sleep',
    q: () => t('It is too bright in here. Help him fall asleep.'),
    hint: () => t('Two things give light in this room.'),
    build(sc) {
      const pane = sc.add({ html: box('background:#9fd3ff;border:.8em solid #e7e1d4;box-sizing:border-box'), x: 70, y: 32, w: 34, h: 30, z: 0 });
      sc.add({ e: '☀️', x: 70, y: 32, s: 14, z: 1 });
      const curtain = sc.add({ html: box('background:repeating-linear-gradient(90deg,#7a4ab8 0 12%,#9466d1 12% 24%);border-radius:.5em'), x: 98, y: 32, w: 36, h: 34, z: 2, drag: 'x' });
      const lamp = sc.add({ e: '💡', x: 22, y: 26, s: 15 });
      lamp.node.style.filter = 'drop-shadow(0 0 1.2em #ffe27a)';
      sc.add({ e: '🛌', x: 46, y: 76, s: 34 });
      let lampOn = true;
      const check = () => {
        const covered = Math.abs(curtain.x - pane.x) < 7;
        sc.root.style.background = !lampOn && covered ? '#14172a' : '';
        if (!lampOn && covered) sc.win(700);
      };
      lamp.onTap = () => {
        lampOn = !lampOn;
        lamp.node.style.filter = lampOn ? 'drop-shadow(0 0 1.2em #ffe27a)' : 'grayscale(1) brightness(.6)';
        sc.sound('tap');
        check();
      };
      curtain.onDrop = check;
    },
  },
  {
    id: 'grey',
    q: () => t('Which small square is darker?'),
    hint: () => t('The background fools your eyes.'),
    answer: { choices: () => [t('The left one'), t('The right one'), t('They are the same')], correct: 2 },
    build(sc) {
      sc.add({ html: box('background:#1a1a1a'), x: 25, y: 50, w: 50, h: 70 });
      sc.add({ html: box('background:#e6e6e6'), x: 75, y: 50, w: 50, h: 70 });
      sc.add({ html: box('background:#808080'), x: 25, y: 50, w: 18, h: 18 });
      sc.add({ html: box('background:#808080'), x: 75, y: 50, w: 18, h: 18 });
    },
  },
  {
    id: 'half',
    q: () => t('What is 8 divided by one half?'),
    hint: () => t('How many halves fit into 8?'),
    answer: { number: 16 },
    build(sc) { sc.add({ html: '<div style="font-weight:800;color:#eef0f7;direction:ltr">8 ÷ ½</div>', x: 50, y: 50, s: 16 }); },
  },
  {
    id: 'bulb',
    q: () => t('Turn on the light.'),
    hint: () => t('Is the bulb where it should be?'),
    build(sc) {
      sc.add({ html: box('background:#cfd3df'), x: 50, y: 6, w: 1, h: 12 });
      const socket = sc.add({ html: box('background:#6d7a8c;border-radius:.4em .4em 1.2em 1.2em'), x: 50, y: 14, w: 9, h: 6 });
      const sw = sc.add({ html: box('background:#e9e6df;border-radius:1em;border:.5em solid #b9b4a8;box-sizing:border-box;position:relative') + '<div class="knob" style="position:absolute;left:30%;top:14%;width:40%;height:34%;background:#777;border-radius:.6em;transition:top .15s"></div>', x: 86, y: 52, w: 12, h: 20 });
      const bulb = sc.add({ e: '💡', x: 28, y: 86, s: 12, drag: true });
      bulb.node.style.filter = 'grayscale(1) brightness(.7)';
      bulb.node.style.transform = 'translate(-50%,-50%) rotate(80deg)';
      let on = false, fitted = false;
      const update = () => {
        sw.node.querySelector('.knob').style.top = on ? '52%' : '14%';
        if (fitted) bulb.node.style.filter = on ? 'drop-shadow(0 0 2em #ffe27a) brightness(1.2)' : 'grayscale(1) brightness(.7)';
        sc.root.style.background = on && fitted ? '#3a3520' : '';
        if (on && fitted) sc.win(700);
      };
      sw.onTap = () => { on = !on; sc.sound('tap'); update(); };
      bulb.onDrop = () => {
        if (sc.dist(bulb, socket) < 14) {
          fitted = true;
          bulb.drag = false;
          bulb.node.style.transform = 'translate(-50%,-50%) rotate(180deg)';
          bulb.set(50, 22);
          sc.sound('place');
          update();
        }
      };
    },
  },
  {
    id: 'months',
    q: () => t('How many months of the year have 28 days?'),
    hint: () => t('Does any month have fewer than 28 days?'),
    answer: { choices: () => ['1', '2', '6', '12'], correct: 3 },
    build(sc) { sc.add({ e: '📅', x: 50, y: 50, s: 44 }); },
  },
  {
    id: 'biggest',
    q: () => t('Tap the biggest number.'),
    hint: () => t('Big letters do not make a big number.'),
    build(sc) {
      const nums = [[7, 30, 32, 34], [99, 72, 30, 22], [12, 28, 74, 18], [1006, 70, 74, 6]];
      for (const [n, x, y, s] of nums) {
        const it = sc.add({ html: `<span style="font-weight:800;color:#eef0f7;direction:ltr">${n}</span>`, x, y, s });
        it.onTap = () => (n === 1006 ? sc.win() : sc.wrong());
      }
    },
  },
  {
    id: 'flower',
    q: () => t('Help the flower grow.'),
    hint: () => t('A plant needs water and sun.'),
    build(sc) {
      const sun = sc.add({ e: '☀️', x: 76, y: 18, s: 18, z: 1 });
      const cloud = sc.add({ e: '☁️', x: 74, y: 20, s: 30, z: 2, drag: true });
      sc.add({ html: box('background:linear-gradient(#c8693f,#9c4a28);border-radius:.6em .6em 2em 2em'), x: 46, y: 84, w: 26, h: 18, z: 2 });
      const plant = sc.add({ e: '🌱', x: 46, y: 70, s: 16, z: 1 });
      const drop = sc.add({ e: '💧', x: 16, y: 34, s: 12, drag: true, z: 3 });
      let watered = false;
      const check = () => {
        const sunny = sc.dist(cloud, sun) > 18;
        if (watered && sunny) {
          plant.node.textContent = '🌷';
          plant.size(26);
          plant.set(46, 62);
          sc.win(700);
        }
      };
      drop.onDrop = () => {
        if (sc.dist(drop, plant) < 16) { watered = true; drop.hide(); sc.sound('pour'); check(); } else drop.home();
      };
      cloud.onDrop = check;
    },
  },
  {
    id: 'subtract',
    q: () => t('How many times can you take 5 away from 25?'),
    hint: () => t('After you take 5 away once, is it still 25?'),
    answer: { choices: () => [t('Only once'), t('Five times')], correct: 0 },
    build(sc) { sc.add({ html: '<div style="font-weight:800;color:#eef0f7;direction:ltr">25 − 5</div>', x: 50, y: 50, s: 16 }); },
  },
  {
    id: 'order',
    q: () => t('What is 1 + 1 × 0?'),
    hint: () => t('Multiply first, then add.'),
    answer: { number: 1 },
    build(sc) { sc.add({ html: '<div style="font-weight:800;color:#eef0f7;direction:ltr;white-space:nowrap">1 + 1 × 0</div>', x: 50, y: 50, s: 14 }); },
  },
  {
    id: 'seesaw',
    q: () => t('Which one is heavier?'),
    hint: () => t('Look at which end of the seesaw is down.'),
    build(sc) {
      sc.add({ html: '<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M50 72L42 88H58Z" fill="#9ba2b9"/><path d="M10 82L90 58" stroke="#c28a4c" stroke-width="4" stroke-linecap="round"/></svg>', x: 50, y: 50, w: 100, h: 100 });
      const balloon = sc.add({ e: '🎈', x: 18, y: 66, s: 22 });
      const brick = sc.add({ e: '🧱', x: 82, y: 50, s: 12 });
      balloon.onTap = () => sc.win();
      brick.onTap = () => sc.wrong();
    },
  },
  {
    id: 'triangles',
    q: () => t('How many triangles can you see?'),
    hint: () => t('The big one counts too.'),
    answer: { choices: () => ['1', '2', '3', '4'], correct: 2 },
    build(sc) {
      sc.add({ html: '<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="#eef0f7" stroke-width="2.4" stroke-linejoin="round"><path d="M50 16L86 80H14Z"/><path d="M50 16L58 80"/></svg>', x: 50, y: 50, w: 100, h: 100 });
    },
  },
  {
    id: 'next',
    q: () => t('What number comes next? 1, 1, 2, 3, 5, …'),
    hint: () => t('Add the two numbers before it.'),
    answer: { number: 8 },
    build(sc) { sc.add({ html: '<div style="font-weight:800;color:#eef0f7;direction:ltr;white-space:nowrap">1, 1, 2, 3, 5, ?</div>', x: 50, y: 50, s: 11 }); },
  },
  {
    id: 'daughters',
    q: () => t('Maya’s father has five daughters: Lala, Lele, Lili and Lolo. What is the fifth daughter’s name?'),
    hint: () => t('Read the first word of the question again.'),
    answer: { choices: () => [t('Lulu'), t('Maya'), t('Lily')], correct: 1 },
    build(sc) { for (const [x, s] of [[14, 13], [32, 14], [50, 15], [68, 14], [86, 13]]) sc.add({ e: '👧', x, y: 52, s }); },
  },
];
