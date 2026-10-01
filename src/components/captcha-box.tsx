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
  const [currentCode, setCurrentCode] = useState<string>('');
  const [isRotating, setIsRotating] = useState(false);

  const drawCaptcha = useCallback((code: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#f1f5f9');
    bgGrad.addColorStop(0.5, '#e2e8f0');
    bgGrad.addColorStop(1, '#f8fafc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw random noise lines
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 120 + 80)}, ${Math.floor(
        Math.random() * 120 + 80
      )}, ${Math.floor(Math.random() * 120 + 80)}, 0.45)`;
      ctx.lineWidth = Math.random() * 1.5 + 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height
      );
      ctx.stroke();
    }

    // Draw random noise dots
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 150)}, ${Math.floor(
        Math.random() * 150
      )}, ${Math.floor(Math.random() * 150)}, 0.4)`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw characters
    const charSpacing = width / (code.length + 1);
    ctx.textBaseline = 'middle';

    const colors = ['#1e293b', '#0f172a', '#1e3a8a', '#0369a1', '#047857', '#b45309', '#6d28d9'];

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      ctx.save();
      const x = charSpacing * (i + 1);
      const y = height / 2 + (Math.random() * 6 - 3);
      const angle = (Math.random() * 26 - 13) * (Math.PI / 180);

      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.font = `bold ${Math.floor(Math.random() * 4 + 22)}px "Courier New", monospace`;
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(char, -7, 0);

      ctx.restore();
    }
  }, []);

  const refreshCaptcha = useCallback(() => {
    setIsRotating(true);
    const newCode = generateRandomCode(5);
    setCurrentCode(newCode);
    onCodeChange(newCode);
    drawCaptcha(newCode);
    setTimeout(() => setIsRotating(false), 400);
  }, [drawCaptcha, onCodeChange]);

  useEffect(() => {
    refreshCaptcha();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div 
        className="relative rounded-lg overflow-hidden border border-gray-300 shadow-inner bg-slate-100 cursor-pointer select-none"
        onClick={refreshCaptcha}
        title="ক্যাপচা পরিবর্তন করতে ক্লিক করুন"
      >
        <canvas
          ref={canvasRef}
          width={150}
          height={44}
          className="block"
        />
      </div>

      <button
        type="button"
        onClick={refreshCaptcha}
        title="নতুন ক্যাপচা কোড আনুন"
        aria-label="Refresh Captcha"
        className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center justify-center shrink-0"
      >
        <RotateCw size={18} className={isRotating ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
