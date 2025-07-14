// auth.js - Token management module
import axios from 'axios';
import * as jwtDecode from 'jwt-decode';

class AuthService {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiry = null;
  }

  // Main method to get authorization header
  async getAuthorization() {
    const token = await this.getToken();
    return `${token.token_type} ${token.access_token}`;
  }

  // Get token with caching and refresh logic
  async getToken() {
    // Return cached token if it's still valid (with 1 minute buffer)
    if (this.token && this.tokenExpiry > new Date(Date.now() + 60000)) {
      return this.token;
    }

    // Determine auth method
    const isOCIM = this.config.authMethod === 'OCIM';

    // Prepare request data based on auth method
    const requestData = new URLSearchParams();
    requestData.append('grant_type', isOCIM ? 'client_credentials' : 'password');
    
    if (isOCIM) {
      requestData.append('client_id', this.config.appKey);
      requestData.append('enterprise_id', this.config.enterpriseId);
      requestData.append('scope', 'urn:opc:hgbu:ws:__myscopes__');
    } else {
      requestData.append('username', this.config.user);
      requestData.append('password', this.config.password);
    }

    // Make the token request
    try {
      const response = await axios.post(this.config.authUrl, requestData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        auth: isOCIM ? undefined : {
          username: this.config.appKey,
          password: '' // Some implementations might require a secret here
        }
      });

      // Store the token and calculate expiry
      this.token = response.data;
      this.tokenExpiry = new Date(Date.now() + (this.token.expires_in * 1000));

      // Log token details
      this.logTokenDetails(this.token.access_token);

      return this.token;
    } catch (error) {
      console.error('Token request failed:', error);
      throw new Error(`Authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Helper to log token details
  logTokenDetails(accessToken) {
    try {
      const decoded = jwtDecode(accessToken);
      console.log('Token details:', {
        header: decoded.header,
        payload: decoded.payload
      });
    } catch (e) {
      console.warn('Failed to decode token for logging:', e);
    }
  }

  // Clear stored token (for logout scenarios)
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
  }
}

// Configuration - should come from your environment/config
const authConfig = {
  authUrl: 'https://mtcs1ua.hospitality-api.ap-singapore-1.ocs.oc-test.com/oauth/v1/tokens', // Replace with your auth endpoint
  appKey: 'fb493ddb-e179-4596-bc7a-7fd1f0461171',
  authMethod: 'OCIM', // or 'PASSWORD'
  enterpriseId: 'DPHSS', // Only for OCIM
  user: '80fe2703f09e487fba77c55696e06ce0', // Only for password auth
  password: '9cc740a4-e311-4353-8a9b-8ef857531771' // Only for password auth
};

// Create singleton instance
const authService = new AuthService(authConfig);

export default authService;