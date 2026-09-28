/** Bundled only into the isolated static review, whose connector is always the fixture.
 * Fail closed if a future change accidentally tries to initialize a real wallet there.
 */
function liveWalletUnavailable(): never {
  throw new Error("Real wallets are unavailable in this review demo.");
}

export {
  liveWalletUnavailable as createWeb3Modal,
  liveWalletUnavailable as useWeb3Modal,
  liveWalletUnavailable as useWeb3ModalState,
  liveWalletUnavailable as walletConnect,
};
