"use client";

import { useEffect, useRef, useState } from "react";
import { PlayLinear as Play, PauseLinear as Pause, QuestionCircleLinear as Volume2, QuestionCircleLinear as VolumeX, QuestionCircleLinear as Maximize, QuestionCircleLinear as PictureInPicture } from "solar-icon-set";

export function CustomVideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const updateProgress = () => {
      setProgress((v.currentTime / v.duration) * 100 || 0);
    };
    const updateDuration = () => setDuration(v.duration);
    const onEnded = () => setPlaying(false);

    v.addEventListener("timeupdate", updateProgress);
    v.addEventListener("loadedmetadata", updateDuration);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", updateProgress);
      v.removeEventListener("loadedmetadata", updateDuration);
      v.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const handleSpeed = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    videoRef.current.playbackRate = nextSpeed;
    setSpeed(nextSpeed);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const val = parseFloat(e.target.value);
    videoRef.current.currentTime = (val / 100) * videoRef.current.duration;
    setProgress(val);
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const togglePip = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      videoRef.current.requestPictureInPicture();
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center group">
      <video ref={videoRef} src={src} onClick={togglePlay} className="max-w-full max-h-full object-contain cursor-pointer" />
      
      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <button onClick={toggleFullscreen} className="text-white pointer-events-auto hover:text-amber-400 transition-colors">
          <Maximize className="w-5 h-5" />
        </button>
        <button onClick={togglePip} className="text-white pointer-events-auto hover:text-amber-400 transition-colors">
          <PictureInPicture className="w-5 h-5" />
        </button>
      </div>

      {/* Big Play Button Overlay */}
      {!playing && (
        <button onClick={togglePlay} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 hover:bg-amber-500 text-white hover:text-slate-950 w-16 h-16 rounded-full flex items-center justify-center transition-colors z-10">
          <Play className="w-8 h-8 ml-1" />
        </button>
      )}

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 right-0 p-4 pt-8 flex items-center gap-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity z-10 ${playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
        <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={progress || 0} 
          onChange={handleSeek} 
          className="flex-1 h-1 rounded-full accent-amber-500 bg-white/20 cursor-pointer appearance-none" 
        />
        
        <div className="flex items-center gap-3">
          <span onClick={handleSpeed} className="text-white text-xs font-bold cursor-pointer select-none hover:text-amber-400 transition-colors">
            {speed}x
          </span>
          <button onClick={toggleMute} className="text-white hover:text-amber-400 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
