import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import TlsOptions from './tlsOptions';
export const metadata = {
  title: 'TLS Login | LXA',
  description: 'Login to LXA via TLS',
};
export default function TLSAuth() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>TLS Authentication</CardTitle>
        <CardDescription>
          What certificate would you like to use?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full">
          <TlsOptions />
        </div>
      </CardContent>
    </Card>
  );
}
