import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Brush, 
  Eraser, 
  Pencil, 
  Droplet, 
  Trash2, 
  Undo,
  Download,
  PaintBucket,
  Palette,
  CloudRain,
  Wand2,
  Sparkles,
  Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Constants & Types ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Parrot', hex: '#84CC16' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Sky Blue', hex: '#0EA5E9' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Dark Brown', hex: '#451A03' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
  { name: 'Rainbow', hex: 'rainbow' }
];

type Tool = 'pencil' | 'brush' | 'bucket';

interface Point {
  x: number;
  y: number;
}

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('brush');
  const [activeColor, setActiveColor] = useState(COLORS[0].hex);
  const [isWet, setIsWet] = useState(false);
  const [isBrushVisible, setIsBrushVisible] = useState(false);
  const [brushPos, setBrushPos] = useState<Point>({ x: 0, y: 0 });
  const [rainbowHue, setRainbowHue] = useState(0);
  const [showWaterAnimation, setShowWaterAnimation] = useState(false);
  const [isAIFixing, setIsAIFixing] = useState(false);
  const [aiDrawingPrompt, setAiDrawingPrompt] = useState("");

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        // Save content
        const tempImage = canvas.toDataURL();
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        // Restore content
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = tempImage;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          contextRef.current = ctx;
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      contextRef.current = ctx;
    }

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Update Rainbow
  useEffect(() => {
    if (activeColor === 'rainbow' && isDrawing) {
      const interval = setInterval(() => {
        setRainbowHue((prev) => (prev + 10) % 360);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isDrawing, activeColor]);

  // --- Handlers ---

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    if (activeTool === 'bucket') {
      const color = activeColor === 'rainbow' ? `hsl(${rainbowHue}, 100%, 50%)` : activeColor;
      contextRef.current.fillStyle = color;
      contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !contextRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    // Follow brush cursor
    setBrushPos({ x, y });

    const ctx = contextRef.current;
    const color = activeColor === 'rainbow' ? `hsl(${rainbowHue}, 100%, 50%)` : activeColor;
    
    ctx.strokeStyle = color;
    
    if (activeTool === 'pencil') {
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
    } else if (activeTool === 'brush') {
      // If brush is not wet, it's faint or doesn't paint?
      // User said: "press the water, and water will get on the brush"
      // Let's make it so it only paints properly if wet.
      ctx.lineWidth = isWet ? 15 : 6;
      ctx.globalAlpha = isWet ? 0.8 : 0.2;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (contextRef.current) {
      contextRef.current.closePath();
    }
    setIsDrawing(false);
  };

  const handleBrushClick = () => {
    setActiveTool('brush');
    setIsBrushVisible(true);
  };

  const handleWaterClick = () => {
    if (activeTool === 'brush') {
      setShowWaterAnimation(true);
      setTimeout(() => {
        setIsWet(true);
        setShowWaterAnimation(false);
      }, 1000);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setAiDrawingPrompt("");
    }
  };

  const handleMagicFix = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isAIFixing) return;

    if (!process.env.GEMINI_API_KEY) {
      setAiDrawingPrompt("Error: Gemini API Key missing.");
      return;
    }

    setIsAIFixing(true);
    setAiDrawingPrompt("");
    
    try {
      // 1. Get image data from canvas
      const imageData = canvas.toDataURL("image/png").split(",")[1];

      // 2. Use gemini-2.5-flash-image to REDRAW the painting
      const prompt = "This is a simple drawing. Please redraw it perfectly and beautifully as a clean illustration, keeping same subject, layout, and colors. Return JUST the new image.";
      
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageData,
                  mimeType: "image/png",
                },
              },
            ],
          },
        ],
      });
      
      // 3. Find the image in the response parts
      let newImageBase64 = "";
      let analysisText = "";

      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData) {
            newImageBase64 = part.inlineData.data;
          } else if (part.text) {
            analysisText += part.text;
          }
        }
      }

      if (newImageBase64) {
        const img = new Image();
        img.onload = () => {
          const ctx = contextRef.current;
          if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw maintaining aspect ratio
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width / 2) - (img.width / 2) * scale;
            const y = (canvas.height / 2) - (img.height / 2) * scale;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            setAiDrawingPrompt("Magic happened! Redraw complete.");
          }
        };
        img.src = `data:image/png;base64,${newImageBase64}`;
      } else {
        setAiDrawingPrompt(analysisText || "AI analyzed it but couldn't redraw.");
      }

    } catch (err) {
      console.error("AI Fix failed:", err);
      setAiDrawingPrompt("AI was too busy painting! Try again.");
    } finally {
      setIsAIFixing(false);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement('a');
      link.download = 'my-painting.png';
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#FFFBEB] font-sans overflow-hidden text-stone-900">
      {/* Header / Tools */}
      <header className="p-4 bg-white border-b-4 border-stone-900 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-10">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBrushClick}
            className={`px-4 py-2 flex items-center gap-2 font-bold uppercase rounded-xl border-2 border-stone-900 transition-colors ${activeTool === 'brush' ? 'bg-yellow-400' : 'bg-white hover:bg-stone-100'}`}
          >
            <Brush size={20} />
            Brush
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleWaterClick}
            className={`px-4 py-2 flex items-center gap-2 font-bold uppercase rounded-xl border-2 border-stone-900 transition-colors ${isWet ? 'bg-sky-400' : 'bg-white hover:bg-stone-100'}`}
          >
            <Droplet size={20} className={isWet ? 'animate-pulse' : ''} />
            Water
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { setActiveTool('pencil'); setIsWet(false); }}
            className={`px-4 py-2 flex items-center gap-2 font-bold uppercase rounded-xl border-2 border-stone-900 transition-colors ${activeTool === 'pencil' ? 'bg-stone-400 text-white' : 'bg-white hover:bg-stone-100'}`}
          >
            <Pencil size={20} />
            Pencil
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setActiveTool('bucket')}
            className={`px-4 py-2 flex items-center gap-2 font-bold uppercase rounded-xl border-2 border-stone-900 transition-colors ${activeTool === 'bucket' ? 'bg-orange-400' : 'bg-white hover:bg-stone-100'}`}
          >
            <PaintBucket size={20} />
            Bucket
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleMagicFix}
            disabled={isAIFixing}
            className={`px-4 py-2 flex items-center gap-2 font-bold uppercase rounded-xl border-2 border-stone-900 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none hover:bg-purple-50 ${isAIFixing ? 'bg-purple-100' : 'bg-white'}`}
          >
            {isAIFixing ? (
              <Loader2 size={20} className="animate-spin text-purple-600" />
            ) : (
              <Sparkles size={20} className="text-purple-600" />
            )}
            AI Fix
          </motion.button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={clearCanvas} className="p-2 hover:bg-red-100 rounded-lg text-red-500 border-2 border-transparent hover:border-red-500 transition-all">
            <Trash2 size={24} />
          </button>
          <button onClick={download} className="px-4 py-2 bg-stone-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-stone-800">
            <Download size={20} />
            Save
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        {/* Canvas Area */}
        <div className="flex-1 relative cursor-crosshair touch-none bg-white m-4 border-4 border-stone-900 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full block"
          />

          {/* AI Fixing Overlay */}
          <AnimatePresence>
            {isAIFixing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-purple-500/10 pointer-events-none flex items-center justify-center"
              >
                <div className="relative">
                   <motion.div
                    animate={{ 
                      scale: [1, 1.5, 1],
                      rotate: [0, 90, 180, 270, 360],
                      x: [0, 50, -50, 0],
                      y: [0, -50, 50, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-purple-600 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                   >
                     <Wand2 size={64} />
                   </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Result Banner */}
          {aiDrawingPrompt && !isAIFixing && (
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-6 py-2 rounded-full border-2 border-stone-900 shadow-xl flex items-center gap-3 z-20"
            >
              <Sparkles className="text-purple-500 shrink-0" size={18} />
              <p className="text-sm font-bold text-stone-700 whitespace-nowrap">
                AI Fixed it: <span className="text-purple-600 italic">"{aiDrawingPrompt}"</span>
              </p>
              <button 
                onClick={() => setAiDrawingPrompt("")}
                className="hover:bg-stone-100 p-1 rounded-full transition-colors"
                title="Dismiss"
              >
                <Trash2 size={14} className="text-stone-400" />
              </button>
            </motion.div>
          )}

          {/* Floaty Brush Asset if active */}
          {isBrushVisible && !isDrawing && (
            <motion.div 
              className="absolute pointer-events-none"
              animate={{ x: brushPos.x, y: brushPos.y - 40 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.5 }}
            >
              <div className="relative">
                <Brush size={40} className={`text-stone-900 fill-current ${isWet ? 'text-sky-500' : ''}`} />
                {isWet && (
                   <motion.div 
                    animate={{ y: [0, 10], opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6 }}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2"
                   >
                     <Droplet size={12} className="text-sky-400 fill-current" />
                   </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Rainbow in background logic? User mentioned "There should be a rainbow too." */}
          <div className="absolute top-4 right-4 pointer-events-none opacity-20">
             <div className="w-48 h-24 rounded-t-full border-t-[20px] border-l-[20px] border-r-[20px] border-red-500 relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 border-t-[40px] border-orange-400 rounded-t-full translate-y-4"></div>
                <div className="absolute inset-0 border-t-[60px] border-yellow-400 rounded-t-full translate-y-8"></div>
                <div className="absolute inset-0 border-t-[80px] border-green-400 rounded-t-full translate-y-12"></div>
                <div className="absolute inset-0 border-t-[100px] border-blue-400 rounded-t-full translate-y-16"></div>
                <div className="absolute inset-0 border-t-[120px] border-purple-400 rounded-t-full translate-y-20"></div>
             </div>
          </div>
        </div>

        {/* Color Palette */}
        <div className="w-full md:w-32 bg-white border-t-4 md:border-t-0 md:border-l-4 border-stone-900 p-4 overflow-y-auto no-scrollbar shadow-[-4px_0px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex md:flex-col flex-wrap gap-2 justify-center">
            {COLORS.map((color) => (
              <motion.button
                key={color.name}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setActiveColor(color.hex);
                  // Picking a color might use up the "wetness" if we want to be realistic?
                  // Or maybe just let them paint.
                }}
                className={`w-10 h-10 md:w-full md:h-12 rounded-lg border-2 border-stone-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center relative overflow-hidden ${activeColor === color.hex ? 'ring-4 ring-offset-2 ring-stone-900' : ''}`}
                style={{ background: color.hex === 'rainbow' ? 'linear-gradient(to bottom, red, orange, yellow, green, blue, purple)' : color.hex }}
                title={color.name}
              >
                {activeColor === color.hex && (
                  <div className="w-2 h-2 rounded-full bg-white border border-stone-900 shadow-sm" />
                )}
                {color.hex === 'rainbow' && (
                  <Palette size={16} className="text-white drop-shadow-md" />
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </main>

      {/* Water Animation Overlay */}
      <AnimatePresence>
        {showWaterAnimation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-sky-200/50 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-8">
              <motion.div
                animate={{ y: [0, 100, 0] }}
                transition={{ duration: 1, ease: 'easeInOut' }}
                className="bg-white p-8 rounded-full border-8 border-stone-900 shadow-2xl"
              >
                <Brush size={120} className="text-stone-900" />
              </motion.div>
              <div className="relative">
                <PaintBucket size={150} className="text-sky-600 fill-current opacity-80" />
                <motion.div 
                  className="absolute inset-0 flex justify-center"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <Droplet size={60} className="text-sky-400 mt-10" />
                </motion.div>
              </div>
              <h2 className="text-3xl font-black uppercase text-stone-900 bg-white px-6 py-2 rounded-xl border-4 border-stone-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                Washing the brush...
              </h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Instructions (Simple) */}
      <footer className="p-2 bg-stone-100 text-center text-xs font-bold uppercase tracking-wider text-stone-500 border-t-2 border-stone-200">
        Brush • Bucket • Pencil • {COLORS.length} Colors • Magic Water
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
