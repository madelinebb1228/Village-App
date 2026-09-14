import React from 'react';
import { View } from 'react-native';
import { Village } from '../../lib/villageData';
import { VillageCard } from '../village/VillageCard';

interface Props {
  village: Village;
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
  width?: number;
}

// Thin fixed-width wrapper around the existing VillageCard so it can sit in
// Discover's horizontal patch rows — VillageCard itself is unchanged/reused.
export default function PatchPreviewCard({ village, joined, joining, onJoin, onOpen, width = 260 }: Props) {
  return (
    <View style={{ width }}>
      <VillageCard village={village} joined={joined} joining={joining} onJoin={onJoin} onOpen={onOpen} fullWidth />
    </View>
  );
}
