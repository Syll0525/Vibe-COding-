// Lightweight particle + floating-text effects in world space.

export class Effects {
  constructor() { this.parts = []; this.texts = []; }

  burst(x, y, { count = 14, icons = null, colors = ['#ff5a5f', '#ffb400', '#1fb5ad', '#7b61ff'], speed = 160, gravity = 260, life = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.6, g: gravity,
        life, max: life, size: 5 + Math.random() * 5, rot: Math.random() * 6,
        icon: icons ? icons[i % icons.length] : null, color: colors[i % colors.length],
      });
    }
  }

  text(x, y, str, color = '#fff') { this.texts.push({ x, y, str, color, life: 1.3, max: 1.3 }); }

  update(dt) {
    for (const p of this.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 5; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx) {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      if (p.icon) {
        ctx.font = `${Math.round(p.size * 3.2)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(p.icon, p.x, p.y);
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 24px "Baloo 2", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      ctx.lineWidth = 5; ctx.strokeStyle = '#2b2340'; ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
