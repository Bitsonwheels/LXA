import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import LoginMethods from './loginMethods';
import AlreadyAuthenticated from '../_components/alreadyAuthenticated';

export const metadata = {
  title: 'Login | LXA',
  description: 'Login to LXA',
};

export default function Authentication() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>
            Please select a login method to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlreadyAuthenticated />
          <LoginMethods />
        </CardContent>
      </Card>
    </>
  );
}
