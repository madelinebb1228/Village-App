import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

export type PatchyMood = 'happy' | 'sleepy' | 'celebrating' | 'encouraging' | 'sad';

interface Props {
  mood?: PatchyMood;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

const IMAGES: Record<PatchyMood, ReturnType<typeof require>> = {
  happy:       require('../assets/patchy/happy.png'),
  sleepy:      require('../assets/patchy/sleepy.png'),
  celebrating: require('../assets/patchy/celebrating.png'),
  encouraging: require('../assets/patchy/encouraging.png'),
  sad:         require('../assets/patchy/encouraging.png'), // placeholder until sad is generated
};

export default function Patchy({ mood = 'happy', size = 120, style }: Props) {
  return (
    <Image
      source={IMAGES[mood]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}
