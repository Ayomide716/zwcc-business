import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen background="surface">
      <EmptyState
        icon="compass-outline"
        title="Page not found"
        message="That screen does not exist, or you no longer have access to it."
      />
      <Button label="Go home" onPress={() => router.replace('/')} fullWidth />
    </Screen>
  );
}
