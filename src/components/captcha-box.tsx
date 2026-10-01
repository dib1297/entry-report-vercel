'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCw } from 'lucide-react';

interface CaptchaBoxProps {
  onCodeChange: (code: string) => void;
}

const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRandomCode(length = 5): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
}

export default function CaptchaBox({ onCodeChange }: CaptchaBoxProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setCurrentCode] = useState<string>('');
  const [isRotating, setIsRotating] = useState(false);

  const drawCaptcha = useCallback((code: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clean light background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Subtle line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, Math.random() * (height - 10) + 5);
    ctx.lineTo(width - 8, Math.random() * (height - 10) + 5);
    ctx.stroke();

    // Draw characters cleanly
    const charSpacing = width / (code.length + 1);
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#1e293b';

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      ctx.save();
      const x = charSpacing * (i + 1);
      const y = height / 2;
      const angle = (Math.random() * 12 - 6) * (Math.PI / 180);

      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(char, -5, 0);
      ctx.restore();
    }
  }, []);

  const refreshCaptcha = useCallback(() => {
    setIsRotating(true);
    const newCode = generateRandomCode(5);
    setCurrentCode(newCode);
    onCodeChange(newCode);
    drawCaptcha(newCode);
    setTimeout(() => setIsRotating(false), 300);
  }, [drawCaptcha, onCodeChange]);

  useEffect(() => {
    refreshCaptcha();
  }, []);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div 
        className="rounded-xl overflow-hidden border border-gray-300 bg-gray-50 cursor-pointer select-none shrink-0 h-[40px] flex items-center"
        onClick={refreshCaptcha}
        title="Click to refresh captcha"
      >
        <canvas
          ref={canvasRef}
          width={92}
          height={40}
          className="block"
        />
      </div>

      <button
        type="button"
        onClick={refreshCaptcha}
        title="Refresh captcha"
        aria-label="Refresh Captcha"
        className="w-[40px] h-[40px] rounded-xl border border-gray-300 text-gray-500 hover:text-[#ff6200] hover:border-[#ff6200] hover:bg-orange-50 active:bg-orange-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
      >
        <RotateCw size={16} className={isRotating ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
