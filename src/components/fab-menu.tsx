"use client";

import { useState } from 'react';
import { MessageCircle, Menu, X } from 'lucide-react';

export default function FabMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .fab-container {
          position: fixed;
          bottom: 12px;
          right: 4px;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }
        
        .fab-menu {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transform-origin: bottom right;
          opacity: ${isOpen ? 1 : 0};
          transform: scale(${isOpen ? 1 : 0.4}) translateY(${isOpen ? '0' : '20px'});
          pointer-events: ${isOpen ? 'auto' : 'none'};
        }

        .fab-item {
          background-color: #ffffff;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          transition: all 0.2s ease;
          white-space: nowrap;
          border: 1px solid #e5e7eb;
          cursor: pointer;
          outline: none;
        }

        .fab-item:hover {
          background-color: #f3f4f6;
          transform: scale(1.05);
        }
        
        .fab-item.whatsapp:hover {
          color: #059669;
          border-color: #059669;
        }

        .fab-main {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background-color: #ff6200;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          cursor: pointer;
          border: none;
          outline: none;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .fab-main:hover {
          transform: scale(1.1) translateY(-2px);
          background-color: #ea580c;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        
        .fab-main:active {
          transform: scale(0.95);
        }
      `}} />

      <div className="fab-container">
        <div className="fab-menu">
          <a href="https://wa.me/919641297534" className="fab-item whatsapp" target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> WhatsApp Help
          </a>
        </div>
        
        <button onClick={toggleMenu} className="fab-main">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </>
  );
}
