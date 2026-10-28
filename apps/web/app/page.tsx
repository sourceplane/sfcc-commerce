import { Carousel } from "components/carousel";
import { ConnectStore } from "components/connect-store";
import { ThreeItemGrid } from "components/grid/three-items";
import Footer from "components/layout/footer";
import { isSFCCConfigured } from "lib/sfcc/connection";

export const metadata = {
  description:
    "High-performance ecommerce store built with Next.js and Salesforce Commerce Cloud.",
  openGraph: {
    type: "website",
  },
};

export default function HomePage() {
  if (!isSFCCConfigured()) {
    return (
      <>
        <ConnectStore />
        <Footer />
      </>
    );
  }

  return (
    <>
      <ThreeItemGrid />
      <Carousel />
      <Footer />
    </>
  );
}
