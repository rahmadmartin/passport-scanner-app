function createOhipReservationClient({ config, axios, debugLog }) {
  let tokenData = {
    token: null,
    expiry: null,
  };

  async function getToken() {
    debugLog('🔑', 'Checking token status...');
  
    // Check if we have a valid token
    if (
      tokenData.token &&
      tokenData.expiry &&
      new Date() < new Date(tokenData.expiry.getTime() - 60000)
    ) {
      debugLog('✅', 'Using cached token');
      return tokenData;
    }
  
    debugLog('🔄', 'Requesting new token...');
  
    const isOCIM = config.Ohip_authMethod?.toUpperCase() === 'OCIM';
  
    try {
      // Prepare form data for URL-encoded request
      const params = new URLSearchParams();
      params.append('grant_type', isOCIM ? 'client_credentials' : 'password');
  
      if (isOCIM) {
        params.append('operaEntId', config.Ohip_enterpriseId);
        params.append('scope', 'urn:opc:hgbu:ws:__myscopes__');
      } else {
        params.append('username', config.Ohip_user);
        params.append('password', config.Ohip_password);
      }
  
      // Prepare headers
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-app-key': config.Ohip_appKey,
      };
  
      if (isOCIM) {
        headers['enterpriseId'] = config.Ohip_enterpriseId;
        // Generate Basic auth header from username and password
        const basicAuthString = Buffer.from(
          `${config.Ohip_user}:${config.Ohip_password}`,
        ).toString('base64');
        headers['Authorization'] = `Basic ${basicAuthString}`;
      }
  
      // debugLog('🔍 Token request headers:', JSON.stringify(headers, null, 2));
      // debugLog('🔍 Token request params:', params.toString());
  
      const response = await axios.post(
        `${config.Ohip_baseURL}/oauth/v1/tokens`,
        params,
        { headers },
      );
  
      if (response.data && response.data.access_token) {
        tokenData.token = response.data;
        tokenData.expiry = new Date(Date.now() + response.data.expires_in * 1000);
  
        // Log token details for debugging (similar to Java implementation)
        try {
          const tokenParts = response.data.access_token.split('.');
          if (tokenParts.length === 3) {
            const header = JSON.parse(
              atob(tokenParts[0].replace(/-/g, '+').replace(/_/g, '/')),
            );
            const payload = JSON.parse(
              atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')),
            );
            // debugLog('🔍', 'Token JWT Header:', header);
            // debugLog('🔍', 'Token JWT Payload:', payload);
          }
        } catch (e) {
          debugLog('⚠️', 'Failed to decode token for logging:', e.message);
        }
  
        debugLog('✅', 'Token obtained successfully');
        return tokenData;
      } else {
        throw new Error('Invalid token response');
      }
    } catch (error) {
      debugLog(
        '🚨',
        'Token request failed:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Authentication failed: ${error.response?.data?.error || error.message}`,
      );
    }
  }
  
  async function getAuthorization() {
    // DEMO short-circuit
    if (config?.HotelPms?.toUpperCase() === 'DEMO') {
      const mockToken = `Bearer DEMO-MOCK-TOKEN-12345`;
      debugLog('🧪', 'DEMO MODE AUTHORIZATION:', mockToken);
      return mockToken;
    }
  
    // Real flow
    const token = await getToken();
    const auth = `${token.token.token_type} ${token.token.access_token}`;
    debugLog('🔑', 'Authorization token acquired');
    return auth;
  }
  
  async function doFindReservation(
    reservationId,
    lastName,
    room,
    disposition,
    arrival,
    departure,
    arrivalEnd,
    departureEnd,
    full,
  ) {
    try {
      // First attempt: Search with reservationId as both confirmationId and externalReferenceId
      let searchParams = {
        reservationIds: null,
        confirmationNumberList: reservationId,
        externalReferenceIds: reservationId,
        customReference: null,
        lastName: lastName,
        room: room,
        arrivalStartDate: arrival,
        departureStartDate: departure,
        arrivalEndDate: arrivalEnd,
        departureEndDate: departureEnd,
        disposition: disposition,
      };
  
      let searchResponse = await findReservations(searchParams);
  
      // If no results and we have a reservationId, try second search with customReference
      if (searchResponse.totalResults === 0) {
        // debugLog('🔍', `First search empty, JSONStringify(${JSON.stringify(searchResponse)}) trying second search with customReference`);
  
        searchParams = {
          reservationIds: null,
          confirmationNumberList: null,
          externalReferenceIds: null,
          customReference: reservationId,
          lastName: lastName,
          room: room,
          arrivalStartDate: arrival,
          departureStartDate: departure,
          arrivalEndDate: arrivalEnd,
          departureEndDate: departureEnd,
          disposition: disposition,
        };
  
        searchResponse = await findReservations(searchParams);
      }
  
      // if (searchResponse.totalResults === 0) {
      //     // debugLog('🔍', `First search empty, JSONStringify(${JSON.stringify(searchResponse)}) trying second search with customReference`);
  
      //     searchParams = {
      //         reservationIds: null,
      //         confirmationNumberList: null,
      //         externalReferenceIds: null,
      //         customReference: null,
      //         lastName: lastName,
      //         room: room,
      //         arrivalStartDate: arrival,
      //         departureStartDate: departure,
      //         arrivalEndDate: arrivalEnd,
      //         departureEndDate: departureEnd,
      //         disposition: disposition
      //     };
  
      //     searchResponse = await findReservations(searchParams);
      // }
  
      // debugLog(
      //   '🔍 Second search found reservations:',
      //   JSON.stringify(searchResponse.totalResults)
      // );
  
      // Extract the actual results array from the response
      const results = searchResponse.reservations || [];
  
      // // Apply additional filtering logic similar to Java code
      // const filteredResults = results.filter(reservation => {
      //     // Apply lastName filtering if lastName is provided
      //     if (lastName && lastName.trim() !== '' && reservation.reservationGuests && reservation.reservationGuests.length > 0) {
      //         const guestLastName = reservation.reservationGuests[0].person?.name?.surname?.toUpperCase() || '';
      //         const filterLastName = lastName.toUpperCase();
  
      //         debugLog('🔍', `Filtering reservation ${reservation.reservationIdList?.[0]?.id} by name similarity`);
  
      //         // Simple name matching (you might want to implement similarity function)
      //         const nameMatches = guestLastName.includes(filterLastName) || filterLastName.includes(guestLastName);
  
      //         if (!nameMatches) {
      //             // Check companions if available (similar to Java logic)
      //             // This would depend on your data structure for companions
      //             return false;
      //         }
      //     }
  
      //     // Apply disposition filtering if provided
      //     if (disposition && disposition.length > 0) {
      //         const reservationStatus = reservation.reservationStatus;
      //         return disposition.includes(reservationStatus);
      //     }
  
      //     return true;
      // });
  
      return results;
    } catch (error) {
      debugLog('🚨', 'doFindReservation failed:', error.message);
      throw error;
    }
  }
  
  async function findReservations(searchParams) {
    debugLog(
      '🔍',
      'Finding reservations with params:',
      JSON.stringify(searchParams, null, 2),
    );
  
    try {
      const authorization = await getAuthorization();
  
      // Prepare the request body based on search parameters
      const requestBody = {
        limit: 100,
        offset: 0,
      };
  
      // Add search parameters to request body (only if they have values)
      if (searchParams.reservationIds && searchParams.reservationIds.length > 0) {
        requestBody.reservationIds = searchParams.reservationIds;
      }
      if (
        searchParams.confirmationNumberList &&
        searchParams.confirmationNumberList.length > 0
      ) {
        requestBody.confirmationNumberList = searchParams.confirmationNumberList;
      }
      if (
        searchParams.externalReferenceIds &&
        searchParams.externalReferenceIds.length > 0
      ) {
        requestBody.externalReferenceIds = searchParams.externalReferenceIds;
      }
      if (
        searchParams.customReference &&
        searchParams.customReference.trim() !== ''
      ) {
        requestBody.customReference = searchParams.customReference;
      }
      if (searchParams.lastName && searchParams.lastName.trim() !== '') {
        requestBody.surname = searchParams.lastName;
      }
      if (searchParams.room && searchParams.room.trim() !== '') {
        requestBody.room = searchParams.room;
      }
      if (searchParams.arrivalStartDate) {
        requestBody.arrivalStartDate = searchParams.arrivalStartDate;
      }
      if (searchParams.departureStartDate) {
        requestBody.departureStartDate = searchParams.departureStartDate;
      }
      if (searchParams.arrivalEndDate) {
        requestBody.arrivalEndDate = searchParams.arrivalEndDate;
      }
      if (searchParams.departureEndDate) {
        requestBody.departureEndDate = searchParams.departureEndDate;
      }
      if (searchParams.disposition && searchParams.disposition.length > 0) {
        // Convert disposition to statuses if needed
        requestBody.statuses = searchParams.disposition;
      }
  
      // Prepare headers matching the curl command
      const headers = {
        'Content-Type': 'application/json',
        'x-hotelid': config.Ohip_hotelId,
        'x-app-key': config.Ohip_appKey,
        Authorization: authorization,
      };
  
      const baseUrl = `${config.Ohip_baseURL}/rsv/v1/hotels/${config.Ohip_hotelId}/reservations`;
  
      // Create URLSearchParams to build the query string
      const urlParams = new URLSearchParams();
      Object.entries(requestBody).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((item) => urlParams.append(key, item));
          } else {
            urlParams.append(key, value);
          }
        }
      });
  
      // const completeUrl = `${baseUrl}?${urlParams.toString()}`;
  
      // logToFile('🔍 Reservation search headers:', JSON.stringify(headers, null, 2));
      // logToFile('🔍 Reservation search params:', JSON.stringify(requestBody, null, 2));
  
      const response = await axios.get(baseUrl, { headers, params: requestBody });
  
      /* The above code is making an asynchronous GET request using the axios library in JavaScript.
          It is sending a request to the `baseUrl` with specified headers and request parameters
          contained in the `requestBody`. The response from the request is stored in the `response`
          variable. */
      // logToFile('🔍 Reservation search response:', JSON.stringify(response.data, null, 2));
      // logToFile('🔍 Complete URL:', completeUrl);
  
      debugLog(
        '🔍',
        'Reservation search response:',
        JSON.stringify(response.data.reservations, null, 2),
      );
  
      if (response.data.reservations.totalResults > 0) {
        return response.data;
      } else {
        debugLog('⚠️', 'No reservations found in response');
        return {
          reservations: [],
          totalResults: 0,
          totalPages: 0,
          hasMore: false,
        };
      }
    } catch (error) {
      debugLog(
        '🚨',
        'Reservation search failed:',
        error.response?.data || error.message,
      );
      if (error.response?.status === 401) {
        // Token might be expired, clear it and retry once
        tokenData.token = null;
        tokenData.expiry = null;
        throw new Error('Authentication failed. Please try again.');
      }
      throw new Error(
        `Reservation search failed: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  return {
    getToken,
    getAuthorization,
    doFindReservation,
    findReservations,
  };
}

module.exports = { createOhipReservationClient };
