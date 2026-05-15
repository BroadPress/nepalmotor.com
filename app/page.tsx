import type { Metadata } from "next";
import { ExchangeToEvForm } from "./ExchangeToEvForm";

export const metadata: Metadata = {
  title: "Exchange to EV | NepalMotor",
  description: "Trade in your vehicle for an electric vehicle.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <div className="mx-auto w-full max-w-[500px] px-5 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <h1 className="text-xl font-bold tracking-tight text-black sm:text-[22px]">
            Exchange to EV
          </h1>
          <div
            className="mt-4 h-px w-full"
            style={{ backgroundColor: "#E0E0E0" }}
            aria-hidden
          />
        </header>
        <ExchangeToEvForm />
      </div>
    </div>
  );
}
