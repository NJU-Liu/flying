import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '雷霆战机 · Thunder Wing',
  description: '驾驶雷霆号穿越星海，在敌机与深空母舰的弹幕中守卫人类最后的航线。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
