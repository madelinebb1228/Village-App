import React from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';

export function VideoPostPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = false; });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 240, borderRadius: 12, marginBottom: 12, backgroundColor: '#000' }}
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}
