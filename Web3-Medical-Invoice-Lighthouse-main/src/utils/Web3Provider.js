import { WagmiProvider, createConfig, http } from "wagmi";
import { polygonZkEvmCardona, filecoin, optimism, filecoinCalibration, optimismSepolia, polygon, polygonAmoy, lineaSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

const config = createConfig(
  getDefaultConfig({
    chains: [filecoin, filecoinCalibration, optimism, optimismSepolia, polygon, polygonAmoy, polygonZkEvmCardona, lineaSepolia],
    transports: {
      [filecoin.id]: http(
        `https://api.node.glif.io`
      ),
    },

    walletConnectProjectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID,

    appName: "Web3 Medical Invoice Dapp",

    appDescription: "A Dapp to create and manage medical invoices.",
    appUrl: "https://family.co",
    appIcon: "https://family.co/logo.png",
  })
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          customTheme={{
            "--ck-accent-color": "#9b4dca",
            "--ck-accent-text-color": "#ffffff",
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
