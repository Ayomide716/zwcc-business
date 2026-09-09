import { LegalDocumentView } from '@/components/app/LegalDocumentView';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { TERMS_AND_CONDITIONS } from '@/config/legal.config';

export default function TermsScreen() {
  return (
    <Screen background="surface">
      <ScreenHeader title="Terms & Conditions" showBack />
      <LegalDocumentView document={TERMS_AND_CONDITIONS} />
    </Screen>
  );
}
