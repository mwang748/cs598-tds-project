import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
// jsdom has no native modal implementation. Browser QA exercises the real dialog.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
HTMLElement.prototype.scrollTo = function () {};
window.scrollTo = function () {};
