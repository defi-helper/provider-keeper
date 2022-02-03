import { AuthEvents, ConnectOptions, Handler, Provider, SignedTx, SignerTx, TypedData, UserData } from '@waves/signer';
import { EventEmitter } from 'typed-ts-events';
import { stringToBytes, base64Encode } from '@waves/ts-lib-crypto';
import { keeperTxFactory, signerTxFactory } from './adapter';

export class ProviderKeeper implements Provider {
    public user: UserData | null = null;
    private readonly _authData: WavesKeeper.IAuthData;
    private _api!: WavesKeeper.TWavesKeeperApi;
    private readonly _emitter: EventEmitter<AuthEvents> = new EventEmitter<AuthEvents>();

    constructor(authData: WavesKeeper.IAuthData) {
        this._authData = authData;
    }

    public on<EVENT extends keyof AuthEvents>(event: EVENT, handler: Handler<AuthEvents[EVENT]>): Provider {
        this._emitter.on(event, handler);

        return this;
    }

    public once<EVENT extends keyof AuthEvents>(event: EVENT, handler: Handler<AuthEvents[EVENT]>): Provider {
        this._emitter.once(event, handler);

        return this;
    }

    public off<EVENT extends keyof AuthEvents>(event: EVENT, handler: Handler<AuthEvents[EVENT]>): Provider {
        this._emitter.off(event, handler);

        return this;
    }

    public connect(options: ConnectOptions): Promise<void> {
        const poll = (resolve) => {
            if (!!window.WavesKeeper) {
                window.WavesKeeper.initialPromise.then((api) => {
                    this._api = api;
                    window.WavesKeeper.publicState().then((state) => {
                        const stateNetworkServer = state.network.server;
                        const stateNetworkByte = state.network.code.charCodeAt(0);
                        if (options.NODE_URL !== stateNetworkServer || options.NETWORK_BYTE !== stateNetworkByte) {
                            throw new Error(
                                `Invalid connect options. Signer connect (${options.NODE_URL} ${options.NETWORK_BYTE}) not equals keeper connect (${stateNetworkServer} ${stateNetworkByte})`
                            );
                        }

                        if (state.account) {
                            this.user = {
                                address: state.account.address,
                                publicKey: state.account.publicKey,
                            };
                            this._emitter.trigger('login', this.user);
                        }
                        resolve();
                    });
                });
            } else setTimeout((_) => poll(resolve), 100);
        };

        return new Promise(poll);
    }

    public login(): Promise<UserData> {
        return this._api.auth(this._authData).then((userData) => {
            this.user = userData;
            return userData;
        });
    }

    public logout(): Promise<void> {
        this.user = null;
        return Promise.resolve();
    }

    public signMessage(data: string | number): Promise<string> {
        return this._api
            .signCustomData({
                version: 2,
                data: [
                    {
                        type: 'string',
                        key: 'name',
                        value: String(data),
                    },
                ],
            })
            .then((data) => data.signature);
    }

    public signTypedData(data: Array<TypedData>): Promise<string> {
        return this._api
            .signCustomData({
                version: 2,
                data: data as WavesKeeper.TTypedData[],
            })
            .then((data) => data.signature);
    }

    public sign<T extends SignerTx>(toSign: T[]): Promise<SignedTx<T>>;
    public sign<T extends Array<SignerTx>>(toSign: T): Promise<SignedTx<T>> {
        if (toSign.length == 1) {
            return this._api
                .signTransaction(keeperTxFactory(toSign[0]))
                .then((data) => [signerTxFactory(data)]) as Promise<SignedTx<T>>;
        }

        return this._api
            .signTransactionPackage(toSign.map((tx) => keeperTxFactory(tx)) as WavesKeeper.TSignTransactionPackageData)
            .then((data) => data.map((tx) => signerTxFactory(tx))) as Promise<SignedTx<T>>;
    }
}
