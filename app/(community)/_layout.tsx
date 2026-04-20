import { Stack } from 'expo-router';

export default function CommunityGroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f5f3ff' },
      }}
    />
  );
}
