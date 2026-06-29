import FluxHostCoordinator from "./FluxHostCoordinator";
import { applyInlineHostBootstrap } from "./FluxBootstrap";

window.addEventListener("load", function () {
    applyInlineHostBootstrap();

    const coordinator = new FluxHostCoordinator(
        window.location.origin,
        (window as any).jQuery,
    );

    coordinator.initialize();
});
