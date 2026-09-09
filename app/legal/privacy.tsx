import { LegalDocumentView } from '@/components/app/LegalDocumentView';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { PRIVACY_POLICY } from '@/config/legal.config';

export default function PrivacyScreen() {
  return (
    <Screen background="surface">
      <ScreenHeader title="Privacy Policy" showBack />
      <LegalDocumentView document={PRIVACY_POLICY} />
    </Screen>
  );
}
