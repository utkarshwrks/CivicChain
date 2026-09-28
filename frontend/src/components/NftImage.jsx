import { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { Skeleton } from './ui.jsx';

/** Lazy-loaded IPFS image with a skeleton while loading and a fallback on gateway error. */
export default function NftImage({ src, alt, className = '' }) {
  const [state, setState] = useState(src ? 'loading' : 'error');
  // The URL can arrive after mount (details loaded asynchronously).
  useEffect(() => { setState(src ? 'loading' : 'error'); }, [src]);
  return (
    <div className={`nft-img ${className}`}>
      {state === 'loading' && <Skeleton w="100%" h="100%" r={0} style={{ position: 'absolute', inset: 0 }} />}
      {state === 'error' ? (
        <div className="nft-img-fallback"><ImageOff size={22} /><span>Image on IPFS</span></div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          style={{ opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
    </div>
  );
}
