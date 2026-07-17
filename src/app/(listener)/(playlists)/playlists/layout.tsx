import type { ReactNode } from "react";

export default function PlaylistsListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="listener-playlists-content px-5 pt-6 pb-4 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
      {children}
    </div>
  );
}
