import FluxHostCoordinator from "./FluxHostCoordinator";

window.addEventListener("load", function () {
    const coordinator = new FluxHostCoordinator(
        window.location.origin,
        (window as any).jQuery,
    );

    coordinator.initialize();
});
