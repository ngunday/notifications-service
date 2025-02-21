import {injectable, inject} from 'inversify';
import {WindowOption} from 'openfin/_v2/api/window/windowOption';

import {Inject} from '../common/Injectables';
import {WebWindow, WebWindowFactory} from '../model/WebWindow';
import {ToggleCenterVisibility, ToggleCenterVisibilitySource, BlurCenter} from '../store/Actions';
import {ServiceStore} from '../store/ServiceStore';
import {renderApp} from '../view/containers/NotificationCenterApp/NotificationCenterApp';
import {MonitorModel} from '../model/MonitorModel';
import {TrayIcon} from '../model/TrayIcon';
import {Action} from '../store/Store';
import {RootState} from '../store/State';

import {AsyncInit} from './AsyncInit';

const windowOptions: WindowOption = {
    name: 'Notification-Center',
    url: 'ui/notification-center.html',
    autoShow: false,
    defaultHeight: 400,
    defaultWidth: 500,
    resizable: false,
    saveWindowState: false,
    defaultTop: 0,
    contextMenu: !(process.env.NODE_ENV === 'production'),
    frame: false,
    alwaysOnTop: true,
    icon: 'ui/favicon.ico',
    backgroundColor: '#373737',
    showTaskbarIcon: false,
    opacity: 0
};

@injectable()
export class NotificationCenter extends AsyncInit {
    private static readonly WIDTH: number = 388;

    private readonly _monitorModel: MonitorModel;
    private readonly _store: ServiceStore;
    private readonly _trayIcon: TrayIcon;
    private readonly _webWindowFactory: WebWindowFactory;

    private _webWindow!: WebWindow;

    public constructor(
        @inject(Inject.MONITOR_MODEL) monitorModel: MonitorModel,
        @inject(Inject.STORE) store: ServiceStore,
        @inject(Inject.TRAY_ICON) trayIcon: TrayIcon,
        @inject(Inject.WEB_WINDOW_FACTORY) webWindowFactory: WebWindowFactory
    ) {
        super();

        this._monitorModel = monitorModel;
        this._store = store;
        this._store.onAction.add(this.onAction, this);
        this._trayIcon = trayIcon;
        this._webWindowFactory = webWindowFactory;
    }

    protected async init() {
        await this._store.initialized;
        await this._monitorModel.initialized;

        // Create notification center app window
        try {
            this._webWindow = await this._webWindowFactory.createWebWindow(windowOptions);
        } catch (error) {
            console.error('Notification Center window could not be created!', error.message);
            throw error;
        }
        await this.hideWindowOffscreen();
        this._trayIcon.setIcon('https://openfin.co/favicon-32x32.png');
        this._trayIcon.onLeftClick.add(() => {
            new ToggleCenterVisibility(ToggleCenterVisibilitySource.TRAY).dispatch(this._store);
        });
        await this.sizeToFit();
        await this.addListeners();

        if (this._store.state.centerVisible) {
            this.showWindow();
        }

        renderApp(this._webWindow, this._store);
    }

    /**
     * The window visibility state.
     */
    public get visible(): boolean {
        const state = this._store.state;
        return state.centerVisible;
    }

    /**
     * Add listeners to the window.
     */
    private async addListeners(): Promise<void> {
        this._webWindow.onBlurred.add(() => {
            if (this.visible && !this._store.state.centerLocked) {
                new BlurCenter().dispatch(this._store);
            }
        });

        this._monitorModel.onMonitorInfoChanged.add(async () => {
            await this.sizeToFit();
            await this.toggleWindow(this._store.state.centerVisible);
        });
    }

    private async onAction(action: Action<RootState>): Promise<void> {
        if (action instanceof ToggleCenterVisibility || action instanceof BlurCenter) {
            await this.toggleWindow(this._store.state.centerVisible);
        }
    }

    /**
     * Show the window.
     */
    public async showWindow(): Promise<void> {
        await this._webWindow.show();
        await this.animateIn();

        await this._webWindow.setAsForeground();
    }

    /**
     * Hide the window.
     * @param force Force the window to hide without animating out.
     */
    public async hideWindow(force?: boolean): Promise<void> {
        const duration = force ? 0 : 300;
        await this.animateOut(duration);
    }

    /**
     * Sets the window dimensions in shape of a side bar
     */
    private async sizeToFit(): Promise<void> {
        const idealWidth = NotificationCenter.WIDTH;
        await this.hideWindow(true);
        const {monitorInfo} = this._monitorModel;
        const {availableRect} = monitorInfo.primaryMonitor;
        const left = availableRect.right - idealWidth;
        const top = availableRect.top;
        // TODO [SERVICE-739] This is a fix for setBounds not working on hidden windows.
        await this._webWindow.showAt(left, top);

        await this._webWindow.setBounds({
            left,
            top,
            width: idealWidth,
            height: availableRect.bottom - availableRect.top
        });

        // TODO [SERVICE-739] This is a fix for setBounds not working on hidden windows.
        await this._webWindow.hide();
    }

    private async hideWindowOffscreen() {
        const {virtualScreen, primaryMonitor} = this._monitorModel.monitorInfo;
        const height = primaryMonitor.availableRect.bottom;
        await this._webWindow.showAt(virtualScreen.left - NotificationCenter.WIDTH * 2, virtualScreen.top - height * 2);
        await this._webWindow.hide();
    }

    /**
     * Toggle window visibility.
     * @param visible Force the window to be shown or hidden. True = show, false = hide.
     */
    private async toggleWindow(visible: boolean): Promise<void> {
        if (visible) {
            return this.showWindow();
        } else {
            return this.hideWindow();
        }
    }

    /**
     * Animate the Notification Center window into view.
     * @param duration Animation duration.
     */
    private async animateIn(duration: number = 300): Promise<void> {
        this._webWindow.animate(
            {
                opacity: {
                    opacity: 1,
                    duration
                }
            },
            {
                interrupt: true,
                tween: 'ease-in-out'
            }
        );
    }

    /**
     * Animate the Notification Center window out of view.
     * @param duration Animation duration.
     */
    private async animateOut(duration: number = 400): Promise<void> {
        this._webWindow.animate(
            {
                opacity: {
                    opacity: 0,
                    duration
                }
            },
            {
                interrupt: true,
                tween: 'ease-in-out'
            }
        );
    }
}
