import { useEffect, useRef } from 'react';

export default function Sparkline({ data = [], width = 160, height = 40, color = '#ffffff' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = (max - min) || 1;
    const pad = 4;
    const step = (width - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [
      pad + i * step,
      height - pad - ((v - min) / range) * (height - pad * 2),
    ]);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // area fill
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], height - pad);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0], height - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // glow line
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // last point
    const [lx, ly] = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, width, height, color]);

  return <canvas ref={ref} className="sparkline" />;
}