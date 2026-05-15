import Image from "next/image";
import { ExchangeToEvForm } from "./ExchangeToEvForm";

const CALL_URL = "https://b.broadpress.org/nepalmotorcall";

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <div className="mx-auto w-full max-w-[500px] px-5 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Image
                src="/logo.jpeg"
                alt="NEPAL Motor"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                priority
              />
              <span className="truncate text-xl font-bold tracking-tight text-black sm:text-2xl">
                NEPAL Motor
              </span>
            </div>
            <a
              href={CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black transition-colors hover:bg-black/5"
              aria-label="Call NEPAL Motor"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
          </div>
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
