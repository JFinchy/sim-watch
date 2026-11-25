/**
 * ShotLab — Kids Zone (Ages 4–5) Cooperative Arcade Engine & SVG Renderer.
 * Exposes `window.ShotLabKids` in Electron renderer and `module.exports` in Node.js.
 */
(function (root) {
  'use strict';

  const KIDS_GAMES = [
    {
      id: 'rocket',
      icon: '🚀',
      name: 'Volcano Rocket Launch',
      short: 'Rocket Launch',
      clubTip: '2" Tall Tee + Short Wedge (Rocket Tape)',
      desc: 'Launch balls off a tall rubber tee to blast the rocket past the stars!',
      goalLabel: '5 Launches or 35y+ Mega Blast = Trophy!',
    },
    {
      id: 'trex',
      icon: '🦖',
      name: 'Defeat the Giant T-Rex',
      short: 'Giant T-Rex',
      clubTip: 'Tall Tee Wedge / Pool Noodle / Putter',
      desc: 'Team up! Every swing knocks 1–2 hearts off the goofy T-Rex!',
      goalLabel: 'Clear all 6 Dino Hearts together = Golden Trophy!',
    },
    {
      id: 'monster',
      icon: '🐊',
      name: 'Feed the Hungry Monster',
      short: 'Hungry Monster',
      clubTip: 'Choked-Down Putter (Great for 2–20 mph rolls)',
      desc: 'Roll putts or gentle chips straight into Chompy the Monster’s belly!',
      goalLabel: 'Feed 6 Snacks together = Happy Monster Trophy!',
    },
    {
      id: 'bowling',
      icon: '🎳',
      name: 'Strike Force Bowling',
      short: 'Strike Bowling',
      clubTip: 'Choked-Down Putter or Short Wedge Bump',
      desc: 'Alternate turns and knock down all 10 bright arcade bowling pins as a team!',
      goalLabel: 'Clear all 10 Pins together = Strike Trophy!',
    },
  ];

  const KIDS_ROUTINE_STEPS = [
    { id: 'warmup', mins: '2–3m', title: 'Animal Escape Warmup', hint: 'Bear Crawl · Frog Jump · Crab Walk · Frozen Flamingo' },
    { id: 'gameA', mins: '4m', title: 'Team Game 1 (Kid Choice)', hint: 'Choked-down Rocket Tape putter or Hungry Monster / Bowling' },
    { id: 'gameB', mins: '4m', title: 'Team Game 2 (Air or Speed)', hint: 'Tall 2" Tee Volcano Rocket or Pool Noodle WHOOSH!' },
    { id: 'boss', mins: '2–3m', title: 'Boss Finale: Giant T-Rex + Stop High!', hint: 'Beat the T-Rex together & STOP while shouting "ONE MORE!"' },
  ];

  const PARENT_CUES = [
    { say: 'Hold the colorful Rocket Tape!', dont: 'Hold the club firmer / fix your grip' },
    { say: 'Send that ball to the stars / monster mouth!', dont: 'Keep your head down & eye on the ball' },
    { say: 'Show me your Superhero Statue for 3 seconds!', dont: 'Transfer your weight to your lead side' },
    { say: 'Make a giant Tornado WHOOSH sound!', dont: 'Turn your hips before your arms' },
    { say: 'Park the club sleeping on the grass!', dont: 'Hurry up, let your brother/sister hit' },
  ];

  const HEAVY_CLUB_TIPS = [
    { icon: '🩹', title: 'NEVER Cut/Saw 5–8yo Shafts', body: 'Sawing shafts turns them into stiff rebar and ruins balance. Wrap bright Rocket Tape 3–5" down the grip instead—the butt end above their hands acts as an easy counterbalance!' },
    { icon: '⛳', title: 'Two-Club Limit (Ages 4–5)', body: 'Keep ONLY the putter and shortest high-lofted wedge/iron out. Hide driver and woods until they swing smoothly without dipping.' },
    { icon: '🟣', title: '2" Tall Rubber Tee + Almost/Foam', body: 'Always tee up full swings high to stop fat-mat jar on little wrists. AlmostGolf balls bounce safely and trigger Launch Pro far better than squishy foam.' },
    { icon: '🌀', title: 'Pool Noodle Speed Stick', body: 'Cut a ~30" foam pool noodle for maximum-effort WHOOSH swings—builds athletic rotational speed with zero joint or growth-plate stress.' },
  ];

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createKidsArcadeState() {
    return {
      rocketBestYds: 0,
      rocketLastPct: 16,
      rocketLaunches: 0,
      trexHp: 6,
      trexMaxHp: 6,
      trexWins: 0,
      monsterSnacks: 0,
      monsterGoal: 6,
      monsterWins: 0,
      pinsStanding: Array(10).fill(true),
      bowlingFrames: 0,
      bowlingStrikes: 0,
      lastBanner: 'Ready on Mission Control! Check safety boxes & blast off!',
      lastSubBanner: 'Tap +1 Star Hit anytime if a gentle swing misses Launch Pro.',
      lastShot: null,
    };
  }

  function resetKidsGame(arcade, gameId) {
    if (!arcade || typeof arcade !== 'object') return arcade;
    if (gameId === 'rocket') {
      arcade.rocketLaunches = 0;
      arcade.rocketLastPct = 16;
      arcade.lastBanner = 'Rocket fueled on the pad! 3-2-1 BLASTOFF!';
    } else if (gameId === 'trex') {
      arcade.trexHp = arcade.trexMaxHp || 6;
      arcade.lastBanner = 'A goofy Giant T-Rex appeared! 6 Hearts to beat!';
    } else if (gameId === 'monster') {
      arcade.monsterSnacks = 0;
      arcade.lastBanner = 'Chompy is hungry! Roll 6 yummy snacks into his belly!';
    } else if (gameId === 'bowling') {
      arcade.pinsStanding = Array(10).fill(true);
      arcade.bowlingFrames = 0;
      arcade.lastBanner = 'Fresh 10-Pin Rack set! Aim straight down the middle!';
    }
    return arcade;
  }

  function applyKidsShotToGame(arcade, gameId, kidShot, playerName = 'Team') {
    const a = arcade || createKidsArcadeState();
    const s = kidShot || { ballSpeed: 18, carryYds: 10, totalYds: 15, apexFt: 4, hla: 0, starsEarned: 1, powerPct: 45, cheerLabel: 'NICE HIT!' };
    const speed = Number.isFinite(Number(s.ballSpeed)) ? Number(s.ballSpeed) : 15;
    const totalYds = Number.isFinite(Number(s.totalYds)) ? Number(s.totalYds) : 12;
    const starsBase = Number.isFinite(Number(s.starsEarned)) ? Math.max(1, Math.min(3, Math.round(s.starsEarned))) : 1;
    const hla = Number.isFinite(Number(s.hla)) ? Number(s.hla) : 0;

    let starsEarned = starsBase;
    let trophyWon = false;
    let headline = `${playerName}: ${s.cheerLabel || 'NICE HIT!'}`;
    let subline = `${Math.round(totalYds)}y total · ${Math.round(speed)} mph`;

    if (gameId === 'rocket') {
      const pct = Math.max(22, Math.min(96, Math.round(18 + (Math.max(totalYds, speed * 0.9) / 48) * 78)));
      a.rocketLastPct = pct;
      a.rocketLaunches += 1;
      if (totalYds > a.rocketBestYds) {
        a.rocketBestYds = Math.round(totalYds);
        headline = `🚀 NEW RECORD! ${playerName} launched ${Math.round(totalYds)} yds!`;
      } else {
        headline = `🚀 ${playerName} BLASTOFF! ${Math.round(totalYds)} yds into space!`;
      }
      if (a.rocketLaunches >= 5 || totalYds >= 35) {
        trophyWon = true;
        starsEarned += 2;
        a.rocketLaunches = 0;
        subline = `MOON LANDING TROPHY UNLOCKED! +${starsEarned} Stars for the Team!`;
      } else {
        subline = `Rocket Launch ${a.rocketLaunches}/5 toward Team Moon Trophy! (+${starsEarned} ★)`;
      }
    } else if (gameId === 'trex') {
      if (a.trexHp <= 0) a.trexHp = a.trexMaxHp || 6;
      const dmg = starsBase >= 3 ? 2 : (totalYds >= 20 ? 2 : 1);
      a.trexHp = Math.max(0, a.trexHp - dmg);
      if (a.trexHp === 0) {
        a.trexWins += 1;
        trophyWon = true;
        starsEarned += 3;
        headline = `🦖 BOOM! ${playerName} & Team DEFEATED THE T-REX!`;
        subline = `Golden Dino Trophy #${a.trexWins}! Stop & high-five or start a new Boss!`;
      } else {
        headline = `🔥 POW! -${dmg} Dino Heart${dmg > 1 ? 's' : ''}! (${a.trexHp} left!)`;
        subline = `Countdown Captain get ready for the next fireball! (+${starsEarned} ★)`;
      }
    } else if (gameId === 'monster') {
      if (a.monsterSnacks >= a.monsterGoal) a.monsterSnacks = 0;
      const straightBonus = Math.abs(hla) <= 8 ? 1 : 0;
      const snacks = starsBase >= 2 ? 2 : (1 + straightBonus >= 2 ? 2 : 1);
      a.monsterSnacks = Math.min(a.monsterGoal, a.monsterSnacks + snacks);
      if (a.monsterSnacks >= a.monsterGoal) {
        a.monsterWins += 1;
        trophyWon = true;
        starsEarned += 2;
        headline = `🐊 BURP!! ${playerName} filled Chompy’s tummy (6/6)!`;
        subline = `Happy Monster Trophy #${a.monsterWins}! (+${starsEarned} ★)`;
      } else {
        headline = `🍪 YUM! Chompy ate +${snacks} snack${snacks > 1 ? 's' : ''}! (${a.monsterSnacks}/${a.monsterGoal})`;
        subline = `${a.monsterGoal - a.monsterSnacks} more gentle rolls to fill his tummy! (+${starsEarned} ★)`;
      }
    } else if (gameId === 'bowling') {
      const standingIdx = [];
      a.pinsStanding.forEach((up, idx) => { if (up) standingIdx.push(idx); });
      if (!standingIdx.length) {
        a.pinsStanding = Array(10).fill(true);
        a.bowlingFrames = 0;
        for (let i = 0; i < 10; i += 1) standingIdx.push(i);
      }
      const straightFactor = Math.max(0.35, 1 - Math.abs(hla) / 28);
      const speedFactor = Math.max(0.4, Math.min(1.0, (speed + totalYds) / 36));
      let knockCount = Math.max(2, Math.min(standingIdx.length, Math.round(standingIdx.length * straightFactor * speedFactor)));
      if (starsBase >= 3 || (speed >= 28 && Math.abs(hla) <= 4)) knockCount = standingIdx.length;
      if (knockCount < standingIdx.length && standingIdx.length <= 3) knockCount = standingIdx.length; // generous spare!
      for (let k = 0; k < knockCount; k += 1) {
        a.pinsStanding[standingIdx[k]] = false;
      }
      a.bowlingFrames += 1;
      const left = a.pinsStanding.filter(Boolean).length;
      if (left === 0) {
        a.bowlingStrikes += 1;
        trophyWon = true;
        starsEarned += 3;
        headline = a.bowlingFrames === 1
          ? `🎳 STRIKE!! ${playerName} knocked ALL 10 PINS DOWN!`
          : `🎳 TEAM SPARE!! All 10 pins cleared together!`;
        subline = `Strike Trophy #${a.bowlingStrikes}! Tap Reset Rack or swing again for a fresh rack!`;
      } else {
        headline = `🎳 CRASH! Toppled ${knockCount} pin${knockCount > 1 ? 's' : ''}! (${left} left)`;
        subline = `Teammate’s turn to pick up the ${left}-pin spare! (+${starsEarned} ★)`;
      }
    }

    a.lastShot = s;
    a.lastBanner = headline;
    a.lastSubBanner = subline;

    return { starsEarned, trophyWon, headline, subline };
  }

  function renderKidsGameSvg(gameId, arcade = createKidsArcadeState(), lastShot = null) {
    const a = arcade || createKidsArcadeState();
    if (gameId === 'rocket') {
      const pct = Math.max(14, Math.min(94, Number.isFinite(Number(a.rocketLastPct)) ? Number(a.rocketLastPct) : 18));
      const ry = Math.round(255 - ((pct - 14) / 80) * 195);
      const hasShot = Boolean(lastShot);
      return `
        <svg viewBox="0 0 640 310" class="kz-svg" role="img" aria-label="Volcano Rocket Launch Arena">
          <defs>
            <linearGradient id="kzSpace" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#080d26"/>
              <stop offset="65%" stop-color="#15234b"/>
              <stop offset="100%" stop-color="#2b193d"/>
            </linearGradient>
          </defs>
          <rect width="640" height="310" rx="16" fill="url(#kzSpace)"/>
          <circle cx="90" cy="52" r="2.5" fill="#fde68a"/><circle cx="170" cy="86" r="2" fill="#e2e8f0"/><circle cx="245" cy="40" r="3" fill="#7dd3fc"/>
          <circle cx="485" cy="64" r="2.5" fill="#fde68a"/><circle cx="565" cy="96" r="2" fill="#e2e8f0"/><circle cx="395" cy="34" r="2" fill="#f9a8d4"/>
          <circle cx="560" cy="56" r="26" fill="#fef08a" opacity="0.92"/>
          <circle cx="552" cy="50" r="5" fill="#fde047" opacity="0.5"/>
          <text x="560" y="96" fill="#fef08a" font-size="11" font-weight="800" text-anchor="middle">MOON GOAL</text>
          <line x1="70" y1="215" x2="570" y2="215" stroke="#334155" stroke-dasharray="6 6"/>
          <text x="74" y="210" fill="#94a3b8" font-size="11" font-weight="700">10y CLOUDS</text>
          <line x1="70" y1="145" x2="570" y2="145" stroke="#334155" stroke-dasharray="6 6"/>
          <text x="74" y="140" fill="#7dd3fc" font-size="11" font-weight="700">25y STARS</text>
          <line x1="70" y1="75" x2="570" y2="75" stroke="#475569" stroke-dasharray="6 6"/>
          <text x="74" y="70" fill="#fde047" font-size="11" font-weight="700">40y+ SUPERNOVA</text>
          <path d="M220 310 L290 232 L350 232 L420 310 Z" fill="#57534e" stroke="#f97316" stroke-width="2"/>
          <ellipse cx="320" cy="232" rx="30" ry="7" fill="#f97316"/>
          ${hasShot ? `<line x1="320" y1="230" x2="320" y2="${ry + 28}" stroke="#38bdf8" stroke-width="5" stroke-dasharray="8 5" opacity="0.7"/>` : ''}
          <g transform="translate(320, ${ry})">
            <polygon points="0,-34 -16,0 16,0" fill="#ef4444" stroke="#fecaca" stroke-width="2"/>
            <rect x="-15" y="0" width="30" height="32" rx="4" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
            <circle cx="0" cy="14" r="8" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/>
            <polygon points="-15,18 -27,34 -15,32" fill="#f59e0b"/>
            <polygon points="15,18 27,34 15,32" fill="#f59e0b"/>
            <polygon points="-9,32 0,${hasShot ? 58 : 42} 9,32" fill="#facc15"/>
          </g>
          <text x="320" y="294" fill="#fed7aa" font-size="13" font-weight="800" text-anchor="middle">BEST ROCKET: ${esc(Math.round(a.rocketBestYds || 0))} YDS · LAUNCHES ${esc(a.rocketLaunches || 0)}/5</text>
        </svg>`;
    }

    if (gameId === 'trex') {
      const maxHp = a.trexMaxHp || 6;
      const hp = Math.max(0, Math.min(maxHp, Number.isFinite(Number(a.trexHp)) ? Number(a.trexHp) : maxHp));
      const hearts = Array.from({ length: maxHp }, (_, i) => {
        const alive = i < hp;
        const hx = 40 + i * 38;
        return `<text x="${hx}" y="42" font-size="28" fill="${alive ? '#fb7185' : '#334155'}">${alive ? '♥' : '♡'}</text>`;
      }).join('');
      const defeated = hp <= 0;
      return `
        <svg viewBox="0 0 640 310" class="kz-svg" role="img" aria-label="Defeat the Giant T-Rex Arena">
          <rect width="640" height="310" rx="16" fill="#0d1b2a"/>
          <rect x="0" y="250" width="640" height="60" fill="#14532d"/>
          ${hearts}
          <text x="40" y="68" fill="#fda4af" font-size="12" font-weight="800">DINO BOSS HEARTS: ${hp}/${maxHp}</text>
          ${lastShot && !defeated ? `<circle cx="290" cy="175" r="14" fill="#f97316" stroke="#fde047" stroke-width="3"/><text x="290" y="180" font-size="16" text-anchor="middle">🔥</text>` : ''}
          <path d="M55 248 Q165 110 385 160" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="7 6" opacity="0.55"/>
          <circle cx="55" cy="248" r="9" fill="#ffffff" stroke="#38bdf8" stroke-width="2"/>
          <rect x="49" y="257" width="12" height="14" rx="2" fill="#f43f5e"/>
          <g transform="translate(${defeated ? 500 : 410}, ${defeated ? 105 : 70}) scale(${defeated ? 0.85 : 1})">
            <rect x="35" y="75" width="90" height="85" rx="28" fill="#22c55e" stroke="#86efac" stroke-width="3"/>
            <path d="M115 140 Q168 158 175 130 Q145 132 120 116 Z" fill="#16a34a"/>
            <rect x="15" y="20" width="96" height="58" rx="18" fill="#22c55e" stroke="#86efac" stroke-width="3"/>
            <rect x="18" y="64" width="62" height="12" rx="4" fill="#86efac"/>
            <circle cx="48" cy="40" r="10" fill="#ffffff"/>
            <circle cx="45" cy="40" r="5" fill="#0f172a"/>
            <rect x="50" y="158" width="22" height="32" rx="6" fill="#16a34a"/>
            <rect x="88" y="158" width="22" height="32" rx="6" fill="#16a34a"/>
            <line x1="35" y1="108" x2="12" y2="118" stroke="#86efac" stroke-width="7" stroke-linecap="round"/>
            ${defeated ? `<text x="60" y="10" fill="#fde047" font-size="22" font-weight="900" text-anchor="middle">💫 KO! 🏆</text>` : ''}
          </g>
          <text x="320" y="288" fill="#bbf7d0" font-size="14" font-weight="800" text-anchor="middle">${defeated ? 'VICTORY!! TEAM TROPHY UNLOCKED!' : 'AIM YOUR BALL TO ZAP THE GOOFY T-REX!'}</text>
        </svg>`;
    }

    if (gameId === 'monster') {
      const goal = a.monsterGoal || 6;
      const snacks = Math.max(0, Math.min(goal, Number.isFinite(Number(a.monsterSnacks)) ? Number(a.monsterSnacks) : 0));
      const full = snacks >= goal;
      const cookies = Array.from({ length: goal }, (_, i) => {
        const eaten = i < snacks;
        const cx = 42 + i * 38;
        return `<circle cx="${cx}" cy="46" r="14" fill="${eaten ? '#f59e0b' : '#1e293b'}" stroke="${eaten ? '#fde68a' : '#475569'}" stroke-width="2.5"/><text x="${cx}" y="51" font-size="14" text-anchor="middle">${eaten ? '🍪' : '·'}</text>`;
      }).join('');
      return `
        <svg viewBox="0 0 640 310" class="kz-svg" role="img" aria-label="Feed the Hungry Monster Arena">
          <rect width="640" height="310" rx="16" fill="#10172a"/>
          <rect x="0" y="232" width="640" height="78" fill="#064e3b"/>
          <line x1="65" y1="255" x2="415" y2="215" stroke="#34d399" stroke-width="5" stroke-dasharray="10 6" opacity="0.6"/>
          <circle cx="65" cy="255" r="10" fill="#ffffff" stroke="#34d399" stroke-width="3"/>
          ${cookies}
          <text x="32" y="78" fill="#fde68a" font-size="12" font-weight="800">CHOMPY SNACK METER: ${snacks}/${goal}</text>
          <g transform="translate(390, 68)">
            <rect x="10" y="20" width="165" height="175" rx="52" fill="#8b5cf6" stroke="#ddd6fe" stroke-width="3"/>
            <circle cx="58" cy="64" r="16" fill="#ffffff"/><circle cx="56" cy="64" r="7" fill="#0f172a"/>
            <circle cx="118" cy="64" r="16" fill="#ffffff"/><circle cx="116" cy="64" r="7" fill="#0f172a"/>
            <ellipse cx="92" cy="134" rx="54" ry="${full ? 24 : 34}" fill="#4c1d95" stroke="#fde047" stroke-width="3"/>
            <polygon points="56,104 68,122 80,104" fill="#ffffff"/>
            <polygon points="104,104 116,122 128,104" fill="#ffffff"/>
            ${full ? `<text x="92" y="10" fill="#fde047" font-size="20" font-weight="900" text-anchor="middle">BURP!! YUM 🏆</text>` : ''}
          </g>
          <text x="320" y="290" fill="#a7f3d0" font-size="14" font-weight="800" text-anchor="middle">${full ? 'CHOMPY IS FULL & HAPPY! +TROPHY!' : 'ROLL PUTTS GENTLY RIGHT INTO CHOMPY’S MOUTH!'}</text>
        </svg>`;
    }

    // bowling
    const pins = Array.isArray(a.pinsStanding) && a.pinsStanding.length === 10 ? a.pinsStanding : Array(10).fill(true);
    const coords = [
      [320, 178],
      [294, 148], [346, 148],
      [268, 118], [320, 118], [372, 118],
      [242, 88], [294, 88], [346, 88], [398, 88],
    ];
    const leftCount = pins.filter(Boolean).length;
    const pinSvg = coords.map(([x, y], idx) => {
      const up = Boolean(pins[idx]);
      return up
        ? `<g transform="translate(${x}, ${y})"><ellipse cx="0" cy="-16" rx="9" ry="18" fill="#f8fafc" stroke="#38bdf8" stroke-width="2"/><rect x="-7" y="-22" width="14" height="5" fill="#ef4444"/><text x="0" y="-8" fill="#0f172a" font-size="9" font-weight="900" text-anchor="middle">${idx + 1}</text></g>`
        : `<g transform="translate(${x + 12}, ${y - 4}) rotate(72)" opacity="0.35"><ellipse cx="0" cy="-12" rx="7" ry="14" fill="#94a3b8"/></g>`;
    }).join('');
    const hla = lastShot && Number.isFinite(Number(lastShot.hla)) ? Number(lastShot.hla) : 0;
    const endX = Math.max(160, Math.min(480, Math.round(320 + hla * 7)));
    return `
      <svg viewBox="0 0 640 310" class="kz-svg" role="img" aria-label="Strike Force Bowling Arena">
        <rect width="640" height="310" rx="16" fill="#0f172a"/>
        <polygon points="120,270 520,270 430,52 210,52" fill="#b45309" opacity="0.28" stroke="#f59e0b" stroke-width="2"/>
        <line x1="320" y1="265" x2="${endX}" y2="115" stroke="#38bdf8" stroke-width="5" stroke-dasharray="9 6" opacity="0.75"/>
        <circle cx="320" cy="264" r="14" fill="#06b6d4" stroke="#cffafe" stroke-width="3"/>
        ${pinSvg}
        <text x="320" y="34" fill="#fde047" font-size="16" font-weight="900" text-anchor="middle">${leftCount === 0 ? '🎉 ALL 10 PINS CLEARED!! TROPHY WON!' : `PINS STANDING: ${leftCount}/10`}</text>
        <text x="320" y="296" fill="#bae6fd" font-size="13" font-weight="800" text-anchor="middle">ROLL PUTTS OR CHIP STRAIGHT TOWARD PIN #1!</text>
      </svg>`;
  }

  const api = {
    KIDS_GAMES,
    KIDS_ROUTINE_STEPS,
    PARENT_CUES,
    HEAVY_CLUB_TIPS,
    createKidsArcadeState,
    resetKidsGame,
    applyKidsShotToGame,
    renderKidsGameSvg,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.ShotLabKids = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
