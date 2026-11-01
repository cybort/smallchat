import { a as aexists, c as aoutput, i as abytes, l as clean, o as ahash, s as anumber } from "./noble__curves+noble__hashes.mjs";
//#region node_modules/@noble/hashes/hmac.js
/**
* HMAC: RFC2104 message authentication code.
* @module
*/
/**
* Internal class for HMAC.
* Accepts any byte key, although RFC 2104 §3 recommends keys at least
* `HashLen` bytes long.
*/
var _HMAC = class {
	oHash;
	iHash;
	blockLen;
	outputLen;
	canXOF = false;
	finished = false;
	destroyed = false;
	constructor(hash, key) {
		ahash(hash);
		abytes(key, void 0, "key");
		this.iHash = hash.create();
		if (typeof this.iHash.update !== "function") throw new Error("expected Hash instance");
		this.blockLen = this.iHash.blockLen;
		this.outputLen = this.iHash.outputLen;
		const blockLen = this.blockLen;
		const pad = new Uint8Array(blockLen);
		pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
		for (let i = 0; i < pad.length; i++) pad[i] ^= 54;
		this.iHash.update(pad);
		this.oHash = hash.create();
		for (let i = 0; i < pad.length; i++) pad[i] ^= 106;
		this.oHash.update(pad);
		clean(pad);
	}
	update(buf) {
		aexists(this);
		this.iHash.update(buf);
		return this;
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const buf = out.subarray(0, this.outputLen);
		this.iHash.digestInto(buf);
		this.oHash.update(buf);
		this.oHash.digestInto(buf);
		this.destroy();
	}
	digest() {
		const out = new Uint8Array(this.oHash.outputLen);
		this.digestInto(out);
		return out;
	}
	_cloneInto(to) {
		to ||= Object.create(Object.getPrototypeOf(this), {});
		const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
		to = to;
		to.finished = finished;
		to.destroyed = destroyed;
		to.blockLen = blockLen;
		to.outputLen = outputLen;
		to.canXOF = canXOF;
		to.oHash = oHash._cloneInto(to.oHash);
		to.iHash = iHash._cloneInto(to.iHash);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
	destroy() {
		this.destroyed = true;
		this.oHash.destroy();
		this.iHash.destroy();
	}
};
var hmac = /* @__PURE__ */ (() => {
	const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
	hmac_.create = (hash, key) => new _HMAC(hash, key);
	return hmac_;
})();
//#endregion
//#region node_modules/@noble/hashes/hkdf.js
/**
* HKDF (RFC 5869): extract + expand in one step.
* See {@link https://soatok.blog/2021/11/17/understanding-hkdf/}.
* @module
*/
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
/**
* HKDF-expand from the spec. The most important part. `HKDF-Expand(PRK, info, L) -> OKM`
* @param hash - hash function that would be used (e.g. sha256)
* @param prk - a pseudorandom key of at least HashLen octets
*   (usually, the output from the extract step)
* @param info - optional context and application specific information (can be a zero-length string)
* @param length - length of output keying material in bytes.
*   RFC 5869 §2.3 allows `0..255*HashLen`, so `0` returns an empty OKM.
* @param _recycled - Internal destroyed extract hashes owned by the combined `hkdf()` call.
* @returns Output keying material with the requested length.
* @throws If the requested output length exceeds the HKDF limit
*   for the selected hash. {@link Error}
* @example
* Run the HKDF expand step.
* ```ts
* import { expand } from '@noble/hashes/hkdf.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* expand(sha256, new Uint8Array(32), new Uint8Array([1, 2, 3]), 16);
* ```
*/
function expand(hash, prk, info, length = 32, _recycled) {
	ahash(hash);
	anumber(length, "length");
	abytes(prk, void 0, "prk");
	const olen = hash.outputLen;
	if (prk.length < olen) throw new Error("\"prk\" must be at least HashLen octets");
	if (length > 255 * olen) throw new Error("Length must be <= 255*HashLen");
	const blocks = Math.ceil(length / olen);
	if (info === void 0) info = EMPTY_BUFFER;
	else abytes(info, void 0, "info");
	if (!blocks) {
		if (_recycled) clean(prk);
		return /* @__PURE__ */ new Uint8Array();
	}
	const okm = _recycled && blocks === 1 ? prk : new Uint8Array(blocks * olen);
	const { iHash, oHash } = hmac.create(hash, prk);
	const T = _recycled ? prk : new Uint8Array(olen);
	const worker = blocks > 1 ? _recycled?.iHash || hash.create() : void 0;
	for (let counter = 0; counter < blocks - 1; counter++) {
		HKDF_COUNTER[0] = counter + 1;
		const iWork = iHash._cloneInto(worker);
		if (counter) iWork.update(T);
		iWork.update(info).update(HKDF_COUNTER).digestInto(T);
		oHash._cloneInto(worker).update(T).digestInto(T);
		okm.set(T, olen * counter);
	}
	HKDF_COUNTER[0] = blocks;
	if (blocks > 1) iHash.update(T);
	iHash.update(info).update(HKDF_COUNTER).digestInto(T);
	oHash.update(T).digestInto(T);
	okm.set(T, olen * (blocks - 1));
	iHash.destroy();
	oHash.destroy();
	worker?.destroy();
	if (T !== okm) clean(T);
	clean(HKDF_COUNTER);
	if (length === okm.length) return okm;
	const res = okm.slice(0, length);
	clean(okm);
	return res;
}
/**
* HKDF (RFC 5869): derive keys from an initial input.
* Combines hkdf_extract + hkdf_expand in one step
* @param hash - hash function that would be used (e.g. sha256)
* @param ikm - input keying material, the initial key
* @param salt - optional salt value (a non-secret random value)
* @param info - optional context and application specific information bytes
* @param length - length of output keying material in bytes.
*   RFC 5869 §2.3 allows `0..255*HashLen`, so `0` returns an empty OKM.
* @returns Output keying material derived from the input key.
* @throws If the requested output length exceeds the HKDF limit
*   for the selected hash. {@link Error}
* @example
* HKDF (RFC 5869): derive keys from an initial input.
* ```ts
* import { hkdf } from '@noble/hashes/hkdf.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
* const inputKey = randomBytes(32);
* const salt = randomBytes(32);
* const info = utf8ToBytes('application-key');
* const okm = hkdf(sha256, inputKey, salt, info, 32);
* ```
*/
var hkdf = (hash, ikm, salt, info, length) => {
	ahash(hash);
	if (salt === void 0) salt = new Uint8Array(hash.outputLen);
	const HMAC = hmac.create(hash, salt).update(ikm);
	return expand(hash, HMAC.digest(), info, length, HMAC);
};
//#endregion
export { hmac as n, hkdf as t };
