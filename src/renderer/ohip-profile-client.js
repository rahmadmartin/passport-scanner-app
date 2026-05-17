function createOhipProfileClient({
  config,
  debugLog,
  getAuthorization,
  fetchRef = fetch,
  alertRef = alert,
}) {
  async function uploadFileWithAuth(fileToUpload) {
    const endpoint = `${config.Ohip_baseURL}/med/config/v1/fileAttachments`;
    const startTime = Date.now();
  
    try {
      // Log the request details (masking sensitive data)
      debugLog(
        '📤',
        'File Upload Request:',
        JSON.stringify({
          method: 'POST',
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            authorization: 'Bearer *****', // Masked
            'x-app-key': config.Ohip_appKey,
            'x-hotelid': config.Ohip_hotelId,
          },
          payload: {
            ...fileToUpload,
            fileAttachment: fileToUpload.fileAttachment
              ? `<binary data (${fileToUpload.fileAttachment.length} bytes)>`
              : undefined,
          },
        }),
      );
  
      // Get authorization token
      const authorization = await getAuthorization();
  
      // Make the API call
      const response = await fetchRef(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(fileToUpload),
      });
  
      const responseTime = Date.now() - startTime;
      const responseData = await response.json();
  
      // Log successful response
      debugLog(
        '✅',
        'File Upload Success:',
        JSON.stringify(responseData, null, 2),
      );
  
      if (!response.ok) {
        // Log error response
        debugLog(
          '❌',
          'File Upload Failed:',
          JSON.stringify({
            status: response.status,
            error: responseData,
            timeTaken: `${responseTime}ms`,
          }),
        );
        throw new Error(`File upload failed with status ${response.status}`);
      }
  
      return responseData;
    } catch (error) {
      debugLog('🚨', 'File Upload Error:', {
        error: error.message,
        stack: error.stack,
        timeTaken: `${Date.now() - startTime}ms`,
      });
      throw error;
    }
  }
  
  async function updateProfileAPI(profileId, authorization, request) {
    const url = `${config.Ohip_baseURL}/crm/v1/profiles/${profileId}`;
  
    debugLog(
      '📤 Update Profile API Request:',
      JSON.stringify({
        method: 'PUT',
        url,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****',
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: request,
      }),
    );
  
    // DEMO short-circuit
    if (config?.HotelPms?.toUpperCase() === 'DEMO') {
      const payload = {
        status: 'success',
        message: 'Mock profile updated successfully',
        profileId,
        request,
      };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
      debugLog(
        '🧪',
        'DEMO MODE RESPONSE:',
        JSON.stringify(await mockResponse.json(), null, 2),
      );
      return mockResponse;
    }
  
    try {
      const response = await fetchRef(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(request),
      });
  
      const responseData = await response.json();
      debugLog(
        '📥 Update Profile API Response:',
        JSON.stringify(responseData, null, 2),
      );
  
      return responseData;
    } catch (error) {
      debugLog(
        '🚨 Update Profile API Request Failed:',
        JSON.stringify({ error: error.message, stack: error.stack }),
      );
      throw error;
    }
  }
  
  async function registerProfileAPI(authorization, request) {
    const url = `${config.Ohip_baseURL}/crm/v1/guests`;
  
    debugLog(
      '📤',
      'Register Profile API Request:',
      JSON.stringify({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****',
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: request,
      }),
    );
  
    // DEMO short-circuit
    if (config?.HotelPms?.toUpperCase() === 'DEMO') {
      const payload = {
        status: 'success',
        message: 'Mock profile registered successfully',
        profileId,
        request,
      };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
      debugLog(
        '🧪',
        'DEMO MODE RESPONSE:',
        JSON.stringify(await mockResponse.json(), null, 2),
      );
      return mockResponse;
    }
  
    try {
      const response = await fetchRef(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(request),
      });
  
      const responseData = await response.json();
      debugLog(
        '📥',
        'Register Profile API Response:',
        JSON.stringify(responseData, null, 2),
      );
  
      return responseData;
    } catch (error) {
      debugLog(
        '🚨',
        'Register Profile API Request Failed:',
        JSON.stringify({ error: error.message, stack: error.stack }),
      );
      throw error;
    }
  }
  
  async function addAccompanyGuest(
    authorization,
    guestProfiles,
    originalReservation,
  ) {
    try {
      debugLog(
        '🔗',
        `Attempting to update guest list for Reservation: ${originalReservation.reservationIdList[0].id}`,
      );
  
      // Build the PUT reservation request payload
      const request = {
        reservations: [
          {
            reservationIdList: [
              {
                id: originalReservation.reservationIdList[0].id,
                type: 'Reservation',
              },
            ],
            reservationGuests: [],
            eCoupons: null,
          },
        ],
      };
  
      const reservationGuests = [];
      const uniqueProfileIds = new Set();
  
      // Add primary guest first
      const primaryGuest = {
        profileInfo: {
          profileIdList: [
            {
              id: originalReservation.reservationGuest.id,
              type: 'Profile',
            },
          ],
        },
        primary: true,
      };
      reservationGuests.push(primaryGuest);
      uniqueProfileIds.add(originalReservation.reservationGuest.id);
  
      // Add companion guests (skip the first one since it's the primary)
      for (let i = 1; i < guestProfiles.length; i++) {
        const companion = guestProfiles[i];
        const extReference = companion.id;
  
        if (extReference && !uniqueProfileIds.has(extReference)) {
          const additionalGuest = {
            profileInfo: {
              profileIdList: [
                {
                  id: extReference,
                  type: 'Profile',
                },
              ],
            },
            primary: false,
          };
          reservationGuests.push(additionalGuest);
          uniqueProfileIds.add(extReference);
        }
      }
  
      // Set the reservation guests
      request.reservations[0].reservationGuests = reservationGuests;
  
      // API endpoint for updating reservation
      const updateUrl =
        config.Ohip_baseURL +
        `/rsv/v1/hotels/${config.Ohip_hotelId}/reservations/${originalReservation.reservationIdList[0].id}`;
  
      debugLog(
        '📤',
        'Update Reservation API Request:',
        JSON.stringify({
          method: 'PUT',
          url: updateUrl,
          headers: {
            'Content-Type': 'application/json',
            authorization: 'Bearer *****', // Masked for logging
            'x-app-key': config.Ohip_appKey,
            'x-hotelid': config.Ohip_hotelId,
          },
          body: request,
        }),
      );
  
      const response = await fetchRef(updateUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = JSON.stringify(await response.json());
        } catch (e) {
          errorText = 'Unable to parse error response';
        }
        debugLog(
          '🚨',
          `Update reservation failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
        throw new Error(
          `Failed to update reservation guest list: ${response.status} ${response.statusText} - ${errorText}`,
        );
      } else {
        alertRef('Guest list successfully updated');
      }
  
      const result = await response.json();
  
      debugLog(
        '✅',
        `Guest list successfully updated for Reservation: ${originalReservation.reservationIdList[0].id}`,
      );
      if (result.OK) return result;
    } catch (error) {
      debugLog('🚨', 'Error in addAccompanyGuest:', error);
      throw error;
    }
  }
  
  async function createShareResvAPI(authorization, request) {
    const url = `${config.Ohip_baseURL}/rsv/v1/hotels/${config.Ohip_hotelId}/reservations`;
  
    debugLog(
      '📤',
      'Create Share Reservation API Request:',
      JSON.stringify({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****',
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: request,
      }),
    );
  
    // DEMO short-circuit
    if (config?.HotelPms?.toUpperCase() === 'DEMO') {
      const payload = {
        status: 'success',
        message: 'Mock share reservation created successfully',
        reservationId: 'MOCK-RESV-123',
        request,
      };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
      debugLog(
        '🧪',
        'DEMO MODE RESPONSE:',
        JSON.stringify(await mockResponse.json(), null, 2),
      );
      return mockResponse;
    }
  
    try {
      const response = await fetchRef(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(request),
      });
  
      const responseData = await response.json();
      return responseData;
    } catch (error) {
      debugLog(
        '🚨 Create Share Reservation API Request Failed:',
        JSON.stringify({ error: error.message, stack: error.stack }),
      );
      throw error;
    }
  }
  
  async function combineShareReservation(
    authorization,
    guestProfiles,
    originalReservation,
  ) {
    debugLog(
      '🔗',
      `Attempting to share guest for Reservation: ${originalReservation.reservationIdList[0].id}`,
    );
    const basicReservation = originalReservation.reservationIdList[0];
    const reservationId = basicReservation.id;
  
    const originalPaymentMethod = originalReservation.paymentMethod;
  
    const url = `${config.Ohip_baseURL}/rsv/v1/hotels/${config.Ohip_hotelId}/reservations/${reservationId}/shares`;
  
    const companion = guestProfiles[1];
    const extReference = companion.id;
    const request = {
      criteria: {
        hotelId: config.Ohip_hotelId,
        combineShareInstruction: {
          overrideMaxOccupancyCheck: true,
          distributionType: 'Entire',
        },
        newReservations: [
          {
            newSharerId: {
              id: extReference,
              type: 'Profile',
            },
            guestCounts: {
              adults: 0,
              children: 0,
            },
            timeSpan: {
              startDate: originalReservation.roomStay.arrivalDate,
              endDate: originalReservation.roomStay.departureDate,
            },
            reservationPaymentMethod: {
              paymentMethod: originalPaymentMethod,
            },
          },
        ],
      },
    };
  
    debugLog(
      '📤',
      'Combine Share Reservation API Request:',
      JSON.stringify({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****',
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: request,
      }),
    );
  
    // DEMO short-circuit
    if (config?.HotelPms?.toUpperCase() === 'DEMO') {
      const payload = {
        status: 'success',
        message: 'Mock share reservations combined successfully',
        existingReservationId,
        shareToReservationId,
        request,
      };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
      debugLog(
        '🧪',
        'DEMO MODE RESPONSE:',
        JSON.stringify(await mockResponse.json(), null, 2),
      );
      return mockResponse;
    }
  
    try {
      const response = await fetchRef(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization,
          'x-app-key': config.Ohip_appKey,
          'x-hotelid': config.Ohip_hotelId,
        },
        body: JSON.stringify(request),
      });
  
      const responseData = await response.json();
      debugLog(
        '🧪',
        'Combine Share Reservation Response:',
        JSON.stringify(responseData, null, 2),
      );
      return {
        ...response,
        json: async () => responseData,
        text: async () => JSON.stringify(responseData),
      };
    } catch (error) {
      debugLog(
        '🚨 Combine Share Reservation API Request Failed:',
        JSON.stringify({ error: error.message, stack: error.stack }),
      );
      throw error;
    }
  }

  return {
    uploadFileWithAuth,
    updateProfileAPI,
    registerProfileAPI,
    addAccompanyGuest,
    createShareResvAPI,
    combineShareReservation,
  };
}

module.exports = { createOhipProfileClient };
