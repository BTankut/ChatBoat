"use client";

import dynamic from "next/dynamic";

const ChatPage = dynamic(() => import("./ChatPage"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <p>Loading...</p>
    </div>
  ),
});

export default function Home() {
  return <ChatPage />;
}
