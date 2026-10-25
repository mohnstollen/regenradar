// Compile-only stub (API 24) – android-23 platform jar lacks it; not packaged into the APK.
package android.webkit;

public abstract class ServiceWorkerController {
    public static ServiceWorkerController getInstance() { throw new RuntimeException("Stub!"); }
    public abstract ServiceWorkerWebSettings getServiceWorkerWebSettings();
    public abstract void setServiceWorkerClient(ServiceWorkerClient client);
}
