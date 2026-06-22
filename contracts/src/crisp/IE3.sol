// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.
pragma solidity >=0.8.27;

import {IEnclave} from "./IEnclave.sol";
import {IPkVerifier} from "./IPkVerifier.sol";

/**
 * @title IE3Program
 * @notice Interface for E3 program validation and verification
 * @dev E3 programs define the computation logic and validation rules for encrypted execution environments
 */
interface IE3Program {
    /// @notice Validate E3 computation parameters and return encryption scheme and input validator
    /// @dev This function is called by the Enclave contract during E3 request to configure the computation
    /// @param e3Id ID of the E3 computation
    /// @param seed Random seed for the computation
    /// @param e3ProgramParams ABI encoded E3 program parameters
    /// @param computeProviderParams ABI encoded compute provider parameters
    /// @param customParams ABI encoded custom parameters defined by the application
    /// @return encryptionSchemeId ID of the encryption scheme to be used for the computation
    function validate(
        uint256 e3Id,
        uint256 seed,
        bytes calldata e3ProgramParams,
        bytes calldata computeProviderParams,
        bytes calldata customParams
    ) external returns (bytes32 encryptionSchemeId);

    /// @notice Verify the ciphertext output of an E3 computation
    /// @dev This function is called by the Enclave contract when ciphertext output is published
    /// @param e3Id ID of the E3 computation
    /// @param ciphertextOutputHash The keccak256 hash of output data to be verified
    /// @param proof ABI encoded data to verify the ciphertextOutputHash
    /// @return success Whether the output data is valid
    function verify(uint256 e3Id, bytes32 ciphertextOutputHash, bytes memory proof) external returns (bool success);

    /// @notice Validate and process input data for a computation
    /// @dev This function is called by the Enclave contract when input is published
    /// @param e3Id ID of the E3 computation
    /// @param sender The account that is submitting the input
    /// @param data The input data to be validated
    function validateInput(uint256 e3Id, address sender, bytes memory data) external;
}

interface IDecryptionVerifier {
    /// @notice This function should be called by the Enclave contract to verify the
    /// decryption of output of a computation.
    /// @param e3Id ID of the E3.
    /// @param plaintextOutputHash The keccak256 hash of the plaintext output to be verified.
    /// @param proof ABI encoded proof of the given output hash.
    /// @return success Whether or not the plaintextOutputHash was successfully verified.
    function verify(uint256 e3Id, bytes32 plaintextOutputHash, bytes memory proof) external view returns (bool success);
}

/**
 * @title E3
 * @notice Represents a complete E3 (Encrypted Execution Environment) computation request and its lifecycle
 * @dev This struct tracks all parameters, state, and results of an encrypted computation
 *      from request through completion
 * @param seed Random seed for committee selection and computation initialization
 * @param committeeSize The committee size enum value for this computation
 * @param requestBlock Block number when the E3 computation was requested
 * @param inputWindow When to start and stop accepting inputs from data providers
 * @param encryptionSchemeId Identifier for the encryption scheme used in this computation
 * @param e3Program Address of the E3 Program contract that validates and verifies the computation
 * @param paramSet BFV encryption parameter set used for this computation
 * @param customParams Arbitrary ABI-encoded application-defined parameters.
 * @param decryptionVerifier Address of the output verifier contract for decryption verification
 * @param committeePublicKey Hash of the public key of the selected committee for this computation
 * @param ciphertextOutput Hash of the encrypted output data produced by the computation
 * @param plaintextOutput Decrypted output data after committee decryption
 * @param requester Address of the entity that requested the E3 computation
 */
struct E3 {
    uint256 seed;
    IEnclave.CommitteeSize committeeSize;
    uint256 requestBlock;
    uint256[2] inputWindow;
    bytes32 encryptionSchemeId;
    IE3Program e3Program;
    uint8 paramSet;
    bytes customParams;
    IDecryptionVerifier decryptionVerifier;
    IPkVerifier pkVerifier;
    bytes32 committeePublicKey;
    bytes32 ciphertextOutput;
    bytes plaintextOutput;
    address requester;
    bool proofAggregationEnabled;
}
