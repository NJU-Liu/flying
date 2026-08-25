'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Shot = Point & { vx: number; vy: number; enemy: boolean };
type Foe = Point & { r: number; hp: number; max: number; speed: number; phase: number; boss?: boolean };
type Drop = Point & { kind: 'power' | 'shield' };
type Dust = Point & { vx: number; vy: number; life: number; color: string };
type Difficulty = 'easy' | 'normal' | 'hard';

type DifficultyConfig = {
  label: string;
  caption: string;
  enemyHp: [number, number];
  moveScale: number;
  bulletScale: number;
  spawnScale: number;
  enemyShotInterval: number;
  bossHp: number;
  bossShots: number;
  bossShotInterval: number;
  bossAt: number;
};

const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { label: '简单', caption: '适合初次巡航', enemyHp: [1, 3], moveScale: .8, bulletScale: .8, spawnScale: 1.28, enemyShotInterval: 118, bossHp: 160, bossShots: 5, bossShotInterval: 44, bossAt: 5000 },
  normal: { label: '普通', caption: '标准作战强度', enemyHp: [2, 5], moveScale: 1, bulletScale: 1, spawnScale: 1, enemyShotInterval: 95, bossHp: 230, bossShots: 7, bossShotInterval: 34, bossAt: 4500 },
  hard: { label: '困难', caption: '弹幕风暴来袭', enemyHp: [3, 7], moveScale: 1.25, bulletScale: 1.25, spawnScale: .72, enemyShotInterval: 70, bossHp: 330, bossShots: 9, bossShotInterval: 26, bossAt: 4000 },
};

const W = 420;
const H = 760;
const MOVEMENT_KEYS = ['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const bestKey = (difficulty: Difficulty) => `thunder-best-${difficulty}`;

function drawShip(c: CanvasRenderingContext2D, x: number, y: number, power: number, shield: number) {
  c.save(); c.translate(x, y);
  if (shield) {
    c.strokeStyle = `rgba(82,237,255,${.5 + Math.sin(performance.now() / 120) * .2})`;
    c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 27, 0, 7); c.stroke();
  }
  const flame = 11 + Math.random() * 9;
  const glow = c.createLinearGradient(0, 14, 0, 35);
  glow.addColorStop(0, '#fff'); glow.addColorStop(.35, '#48e7ff'); glow.addColorStop(1, 'transparent');
  c.fillStyle = glow; c.beginPath(); c.moveTo(-6, 14); c.lineTo(0, 16 + flame); c.lineTo(6, 14); c.fill();
  c.shadowBlur = 18; c.shadowColor = '#53e9ff'; c.fillStyle = '#dffcff';
  c.beginPath(); c.moveTo(0, -24); c.lineTo(18, 14); c.lineTo(6, 10); c.lineTo(0, 17); c.lineTo(-6, 10); c.lineTo(-18, 14); c.closePath(); c.fill();
  c.fillStyle = power >= 3 ? '#ff4fd8' : '#38d9ff';
  c.beginPath(); c.moveTo(0, -15); c.lineTo(5, 7); c.lineTo(0, 12); c.lineTo(-5, 7); c.closePath(); c.fill(); c.restore();
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<Point>({ x: W / 2, y: H - 105 });
  const dragging = useRef(false);
  const inputMode = useRef<'keyboard' | 'pointer'>('pointer');
  const keys = useRef(new Set<string>());
  const raf = useRef(0);
  const game = useRef({
    running: false, paused: false, difficulty: 'normal' as Difficulty, score: 0, lives: 3, bombs: 2, power: 1, shield: 0,
    player: { x: W / 2, y: H - 105 }, shots: [] as Shot[], foes: [] as Foe[], drops: [] as Drop[], dust: [] as Dust[],
    stars: Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: .3 + Math.random() * 2.2 })),
    tick: 0, lastShot: 0, spawn: 0, inv: 0, bossAt: DIFFICULTIES.normal.bossAt,
  });
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');
  const [ui, setUi] = useState({ screen: 'menu', score: 0, best: 0, lives: 3, bombs: 2, power: 1, boss: 0, bossMax: 1, difficulty: 'normal' as Difficulty });

  const sync = useCallback((screen?: string) => {
    const s = game.current;
    const saved = Number(localStorage.getItem(bestKey(s.difficulty)) || 0);
    const boss = s.foes.find(f => f.boss);
    setUi(v => ({ screen: screen ?? v.screen, score: s.score, best: Math.max(saved, s.score), lives: s.lives, bombs: s.bombs, power: s.power, boss: boss?.hp || 0, bossMax: boss?.max || 1, difficulty: s.difficulty }));
  }, []);

  useEffect(() => {
    const legacy = Number(localStorage.getItem('thunder-best') || 0);
    if (legacy && !localStorage.getItem(bestKey('normal'))) localStorage.setItem(bestKey('normal'), String(legacy));
    const stored = localStorage.getItem('thunder-difficulty');
    const initial: Difficulty = stored === 'easy' || stored === 'hard' || stored === 'normal' ? stored : 'normal';
    game.current.difficulty = initial;
    setSelectedDifficulty(initial);
    setUi(v => ({ ...v, difficulty: initial, best: Number(localStorage.getItem(bestKey(initial)) || 0) }));
  }, []);

  const burst = (x: number, y: number, color = '#ff9c52', n = 16) => {
    const s = game.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, v = 1 + Math.random() * 4;
      s.dust.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 20 + Math.random() * 28, color });
    }
  };

  const chooseDifficulty = (difficulty: Difficulty) => {
    if (game.current.running) return;
    game.current.difficulty = difficulty;
    setSelectedDifficulty(difficulty);
    localStorage.setItem('thunder-difficulty', difficulty);
    setUi(v => ({ ...v, difficulty, best: Number(localStorage.getItem(bestKey(difficulty)) || 0) }));
  };

  const begin = useCallback(() => {
    const s = game.current;
    const config = DIFFICULTIES[selectedDifficulty];
    Object.assign(s, { running: true, paused: false, difficulty: selectedDifficulty, score: 0, lives: 3, bombs: 2, power: 1, shield: 0, player: { x: W / 2, y: H - 105 }, shots: [], foes: [], drops: [], dust: [], tick: 0, lastShot: 0, spawn: 0, inv: 100, bossAt: config.bossAt });
    pointer.current = { ...s.player }; inputMode.current = 'pointer'; dragging.current = false;
    localStorage.setItem('thunder-difficulty', selectedDifficulty);
    sync('playing');
  }, [selectedDifficulty, sync]);

  const bomb = useCallback(() => {
    const s = game.current;
    if (!s.running || s.paused || !s.bombs) return;
    s.bombs--; s.shots = s.shots.filter(b => !b.enemy);
    s.foes.forEach(f => { f.hp -= f.boss ? 35 : 99; burst(f.x, f.y, '#76f7ff', f.boss ? 28 : 10); });
    s.inv = 120; sync();
  }, [sync]);

  const pause = useCallback(() => {
    const s = game.current;
    if (!s.running) return;
    s.paused = !s.paused; sync(s.paused ? 'paused' : 'playing');
  }, [sync]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase(); keys.current.add(key);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      if (key === 'b' || key === ' ') bomb();
      if (key === 'p') pause();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    addEventListener('keydown', down); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, [bomb, pause]);

  useEffect(() => {
    const cv = canvas.current, c = cv?.getContext('2d');
    if (!cv || !c) return;
    const loop = () => {
      const s = game.current, config = DIFFICULTIES[s.difficulty];
      c.clearRect(0, 0, W, H);
      const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#080820'); bg.addColorStop(.55, '#0b1232'); bg.addColorStop(1, '#160a2c');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      s.stars.forEach(st => { if (s.running && !s.paused) st.y = (st.y + st.s) % H; c.globalAlpha = .35 + st.s / 3; c.fillStyle = st.s > 1.5 ? '#67e8ff' : '#fff'; c.fillRect(st.x, st.y, st.s, st.s * 2.2); }); c.globalAlpha = 1;

      if (s.running && !s.paused) {
        s.tick++; if (s.inv) s.inv--; if (s.shield) s.shield--;
        const k = keys.current, p = s.player, speed = 5;
        const keyboardMoving = MOVEMENT_KEYS.some(key => k.has(key));
        if (keyboardMoving) {
          inputMode.current = 'keyboard';
          if (k.has('a') || k.has('arrowleft')) p.x -= speed;
          if (k.has('d') || k.has('arrowright')) p.x += speed;
          if (k.has('w') || k.has('arrowup')) p.y -= speed;
          if (k.has('s') || k.has('arrowdown')) p.y += speed;
          p.x = clamp(p.x, 24, W - 24); p.y = clamp(p.y, 80, H - 35);
          pointer.current = { ...p };
        } else if (inputMode.current === 'pointer') {
          p.x += (pointer.current.x - p.x) * .22; p.y += (pointer.current.y - p.y) * .22;
          p.x = clamp(p.x, 24, W - 24); p.y = clamp(p.y, 80, H - 35);
        }

        if (s.tick - s.lastShot > Math.max(5, 13 - s.power)) {
          s.lastShot = s.tick;
          const spread = s.power >= 4 ? [-.7, 0, .7] : s.power >= 2 ? [-.25, .25] : [0];
          spread.forEach(v => s.shots.push({ x: p.x + v * 18, y: p.y - 22, vx: v, vy: -10, enemy: false }));
        }

        s.spawn--;
        const bossAlive = s.foes.some(f => f.boss);
        if (s.score >= s.bossAt && !bossAlive) {
          s.foes.push({ x: W / 2, y: 100, r: 44, hp: config.bossHp, max: config.bossHp, speed: .45 * config.moveScale, phase: 0, boss: true }); s.bossAt += 9000;
        } else if (s.spawn <= 0 && !bossAlive) {
          const tough = Math.random() > .75;
          const hp = tough ? config.enemyHp[1] : config.enemyHp[0];
          s.foes.push({ x: 34 + Math.random() * (W - 68), y: -30, r: tough ? 19 : 14, hp, max: hp, speed: (1.2 + Math.random() * 1.25) * config.moveScale, phase: Math.random() * 6 });
          s.spawn = Math.max(14, Math.max(20, 52 - s.score / 1000) * config.spawnScale);
        }

        s.foes.forEach(f => {
          f.phase += .035; f.y += f.speed; f.x += Math.sin(f.phase) * (f.boss ? 1.1 : .8) * config.moveScale;
          const interval = f.boss ? config.bossShotInterval : config.enemyShotInterval;
          if (s.tick % interval === 0 && f.y > 20) {
            const count = f.boss ? config.bossShots : 1;
            for (let i = 0; i < count; i++) {
              const vx = f.boss ? (i - (count - 1) / 2) * .72 * config.bulletScale : (p.x - f.x) / Math.max(80, p.y - f.y) * 3 * config.bulletScale;
              s.shots.push({ x: f.x, y: f.y + f.r, vx, vy: (f.boss ? 3.2 : 3.4) * config.bulletScale, enemy: true });
            }
          }
        });

        s.shots.forEach(b => {
          b.x += b.vx; b.y += b.vy;
          if (b.enemy && Math.abs(b.x - p.x) < 12 && Math.abs(b.y - p.y) < 15 && !s.inv) {
            b.y = H + 50;
            if (s.shield) { s.shield = 0; s.inv = 50; }
            else {
              s.lives--; s.inv = 130; burst(p.x, p.y, '#64eaff', 25);
              if (s.lives <= 0) {
                s.running = false;
                localStorage.setItem(bestKey(s.difficulty), String(Math.max(s.score, Number(localStorage.getItem(bestKey(s.difficulty)) || 0))));
                sync('gameover');
              }
            }
          }
        });
        for (const b of s.shots.filter(x => !x.enemy)) for (const f of s.foes) {
          if (f.hp > 0 && Math.hypot(b.x - f.x, b.y - f.y) < f.r + 5) {
            b.y = -80; f.hp--;
            if (f.hp <= 0) {
              s.score += f.boss ? 5000 : f.max * 120; burst(f.x, f.y, f.boss ? '#ff55cf' : '#ff9b5a', f.boss ? 65 : 18);
              if (!f.boss && Math.random() < .16) s.drops.push({ x: f.x, y: f.y, kind: Math.random() < .72 ? 'power' : 'shield' });
            }
          }
        }
        s.drops.forEach(d => { d.y += 1.8; if (Math.hypot(d.x - p.x, d.y - p.y) < 24) { d.y = H + 50; if (d.kind === 'power') s.power = Math.min(5, s.power + 1); else s.shield = 600; s.score += 300; } });
        s.dust.forEach(q => { q.x += q.vx; q.y += q.vy; q.vx *= .97; q.vy *= .97; q.life--; });
        s.shots = s.shots.filter(b => b.y > -60 && b.y < H + 40 && b.x > -40 && b.x < W + 40); s.foes = s.foes.filter(f => f.hp > 0 && f.y < H + 70); s.drops = s.drops.filter(d => d.y < H + 30); s.dust = s.dust.filter(q => q.life > 0);
        if (s.tick % 12 === 0) sync();
      }

      s.shots.forEach(b => { c.save(); c.shadowBlur = 12; c.shadowColor = b.enemy ? '#ff487f' : '#48eaff'; c.fillStyle = b.enemy ? '#ff6c91' : '#c9fbff'; if (b.enemy) { c.beginPath(); c.arc(b.x, b.y, 4, 0, 7); c.fill(); } else c.fillRect(b.x - 2, b.y - 10, 4, 18); c.restore(); });
      s.foes.forEach(f => { c.save(); c.translate(f.x, f.y); c.shadowBlur = 16; c.shadowColor = f.boss ? '#ff3ec8' : '#ff664e'; c.fillStyle = f.boss ? '#6e1f75' : '#9b2d46'; c.beginPath(); if (f.boss) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 30 : 48; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); } else { c.moveTo(0, f.r); c.lineTo(f.r, -f.r); c.lineTo(0, -f.r * .45); c.lineTo(-f.r, -f.r); c.closePath(); } c.fill(); c.fillStyle = '#ffd6f5'; c.beginPath(); c.arc(0, 0, f.boss ? 12 : 5, 0, 7); c.fill(); c.restore(); });
      s.drops.forEach(d => { c.save(); c.translate(d.x, d.y); c.rotate(s.tick * .03); c.shadowBlur = 16; c.shadowColor = d.kind === 'power' ? '#ffe358' : '#56edff'; c.fillStyle = d.kind === 'power' ? '#ffd84d' : '#49e8ff'; c.fillRect(-9, -9, 18, 18); c.fillStyle = '#09142c'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText(d.kind === 'power' ? 'P' : 'S', 0, 5); c.restore(); });
      s.dust.forEach(q => { c.globalAlpha = Math.min(1, q.life / 12); c.fillStyle = q.color; c.fillRect(q.x, q.y, 3, 3); }); c.globalAlpha = 1;
      if (!s.running || s.inv % 10 < 6) drawShip(c, s.player.x, s.player.y, s.power, s.shield);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [sync]);

  const movePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: clamp((e.clientX - r.left) * W / r.width, 24, W - 24), y: clamp((e.clientY - r.top) * H / r.height, 80, H - 35) };
    inputMode.current = 'pointer';
  };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); movePointer(e); };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => { if (dragging.current) movePointer(e); };
  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => { if (dragging.current) movePointer(e); dragging.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const difficultyPicker = <div className="difficulty-picker" aria-label="选择游戏难度">{(Object.keys(DIFFICULTIES) as Difficulty[]).map(id => <button key={id} className={selectedDifficulty === id ? 'selected' : ''} onClick={() => chooseDifficulty(id)} aria-pressed={selectedDifficulty === id}><b>{DIFFICULTIES[id].label}</b><small>{DIFFICULTIES[id].caption}</small></button>)}</div>;

  return <main className="game-shell">
    <section className="brand-panel"><div className="eyebrow">NEBULA DEFENSE FORCE · 2077</div><h1><span>雷霆</span><br />战机</h1><p className="tagline">穿越星海，击碎黑暗。</p><div className="howto"><b>操控指南</b><span>移动：拖动战机 / WASD / 方向键</span><span>释放炸弹：点击按钮 / 空格 / B</span><span>暂停：P</span></div><div className="record"><span>{DIFFICULTIES[ui.difficulty].label}最高</span><strong>{ui.best.toLocaleString()}</strong></div></section>
    <section className="machine">
      <div className="topbar"><div><span>SCORE</span><b>{ui.score.toString().padStart(7, '0')}</b></div><div className={`difficulty-status ${ui.difficulty}`}><span>DIFFICULTY</span><b>{DIFFICULTIES[ui.difficulty].label}</b></div><div><span>POWER</span><b className="power">{'◆'.repeat(ui.power)}{'◇'.repeat(5 - ui.power)}</b></div></div>
      <div className="screen-wrap"><canvas ref={canvas} width={W} height={H} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={() => { dragging.current = false; }} aria-label="雷霆战机游戏画面" />
        {ui.screen !== 'playing' && <div className="overlay">
          {ui.screen === 'menu' && <><div className="crest">⚡</div><h2>星门已开启</h2><p>选择作战强度，守卫人类最后的航线</p>{difficultyPicker}<button className="start-button" onClick={begin}>开始出击 <i>›</i></button></>}
          {ui.screen === 'paused' && <><div className="crest small">Ⅱ</div><h2>战斗暂停</h2><p>{DIFFICULTIES[ui.difficulty].label}难度 · 调整呼吸，星海仍在等待</p><button className="start-button" onClick={pause}>继续战斗 <i>›</i></button></>}
          {ui.screen === 'gameover' && <><div className="crest danger">×</div><h2>战机坠毁</h2><p>本次得分 <b>{ui.score.toLocaleString()}</b></p>{difficultyPicker}<button className="start-button" onClick={begin}>再次出击 <i>›</i></button></>}
        </div>}
        {ui.boss > 0 && <div className="bossbar"><span>警告 · 深空母舰</span><i style={{ width: `${ui.boss / ui.bossMax * 100}%` }} /></div>}
      </div>
      <div className="bottombar"><div className="lives">{[0, 1, 2].map(i => <span key={i} className={i < ui.lives ? 'on' : ''}>▲</span>)}</div><button className="pause" onClick={pause} aria-label="暂停游戏">Ⅱ</button><button className="bomb" onClick={bomb}><span>✦</span><b>量子炸弹</b><em>× {ui.bombs}</em></button></div>
    </section>
    <footer><span>THUNDER WING // ONLINE</span><span className="status">系统运行正常</span></footer>
  </main>;
}
