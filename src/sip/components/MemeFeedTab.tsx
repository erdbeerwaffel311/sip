import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Send,
  Upload,
  Smile,
  Heart,
  Flame,
  MessageSquare,
  Sparkles,
  Link2,
} from 'lucide-react';
import { SipMeme } from '../types';

interface MemeFeedTabProps {
  memes: SipMeme[];
  currentUserName: string;
  onAddMeme: (meme: { author: string; imageUrl: string; caption: string }) => void;
  onReactMeme: (memeId: string, emoji: string) => void;
}

const POPULAR_EMOJIS = ['😂', '🔥', '💀', '👏', '💯', '🤝', '👀'];

export const MemeFeedTab: React.FC<MemeFeedTabProps> = ({
  memes,
  currentUserName,
  onAddMeme,
  onReactMeme,
}) => {
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Komprimiert hochgeladene Bilder auf max 800px Breite/Höhe via HTML5 Canvas
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setSelectedFilePreview(compressed);
          setImageUrl(compressed);
        }
      };
      if (typeof readerEvent.target?.result === 'string') {
        img.src = readerEvent.target.result;
      }
    };
    reader.readAsDataURL(file);
  }

  function handlePostMeme(e: React.FormEvent) {
    e.preventDefault();
    const finalImage = selectedFilePreview || imageUrl.trim();
    if (!finalImage) {
      alert('Bitte lade ein Bild hoch oder gib eine Bild-URL ein.');
      return;
    }

    onAddMeme({
      author: currentUserName,
      imageUrl: finalImage,
      caption: caption.trim() || 'SiP Meme',
    });

    setCaption('');
    setImageUrl('');
    setSelectedFilePreview(null);
    setShowUrlInput(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Upload Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30">
            <Smile className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold">SiP Meme-Chat & Lockerung</h3>
            <p className="text-xs text-slate-400">
              Lade ein Meme hoch – sichtbar für alle Mitglieder & die Strategieführung!
            </p>
          </div>
        </div>

        <form onSubmit={handlePostMeme} className="space-y-3">
          <div>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Spruch / Caption zum Meme eingeben..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-pink-500"
            />
          </div>

          {/* Image Preview if selected */}
          {selectedFilePreview && (
            <div className="relative inline-block rounded-2xl overflow-hidden border border-slate-700 max-h-48">
              <img
                src={selectedFilePreview}
                alt="Meme Vorschau"
                className="max-h-48 object-cover rounded-xl"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedFilePreview(null);
                  setImageUrl('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-2 right-2 px-2 py-1 bg-black/70 hover:bg-black rounded-lg text-xs text-white"
              >
                Entfernen
              </button>
            </div>
          )}

          {/* URL Input if opened */}
          {showUrlInput && !selectedFilePreview && (
            <div>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (Bild-URL)"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-pink-500"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-pink-400" />
                <span>Bild hochladen</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Bild-URL</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={!selectedFilePreview && !imageUrl.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Meme posten</span>
            </button>
          </div>
        </form>
      </div>

      {/* Meme Feed */}
      <div className="space-y-4">
        {memes.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 text-slate-400">
            <Smile className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Noch keine Memes geteilt.</p>
            <p className="text-xs text-slate-500 mt-1">
              Sei die erste Person und lockere das Parlament auf! 😄
            </p>
          </div>
        ) : (
          memes.map((meme) => (
            <div
              key={meme.id}
              className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl text-white"
            >
              {/* Header */}
              <div className="p-4 flex items-center justify-between border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white">
                    {meme.author.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-200">
                      {meme.author}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {new Date(meme.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      Uhr
                    </span>
                  </div>
                </div>
              </div>

              {/* Meme Image */}
              <div className="relative bg-black flex items-center justify-center max-h-[500px] overflow-hidden">
                <img
                  src={meme.imageUrl}
                  alt={meme.caption}
                  className="max-h-[500px] w-full object-contain"
                  loading="lazy"
                />
              </div>

              {/* Caption */}
              {meme.caption && (
                <div className="p-4 border-b border-slate-800/80">
                  <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed">
                    {meme.caption}
                  </p>
                </div>
              )}

              {/* Reactions Bar */}
              <div className="p-3 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {POPULAR_EMOJIS.map((emoji) => {
                    const userList = meme.reactions?.[emoji] || [];
                    const hasReacted = userList.includes(currentUserName);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => onReactMeme(meme.id, emoji)}
                        title={
                          userList.length > 0
                            ? `Reagiert von: ${userList.join(', ')}`
                            : 'Reagieren'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                          hasReacted
                            ? 'bg-pink-500/20 border-pink-500/50 text-pink-300'
                            : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        <span>{emoji}</span>
                        {userList.length > 0 && (
                          <span className="text-[11px] opacity-90">{userList.length}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
