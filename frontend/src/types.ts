export interface User {
  name: string;
  picture: string;
  email: string;
  userId: string;
  role: "driver" | "passenger";
}

export interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  origin: string;
  destination: string;
  departureTime: string;
  maxPassengers: number;
  currentPassengers: number;
  status: string;
}

// 用於置頂房間
export interface ChatRoomType {
  id: string;
  name: string;
  isPinned?: boolean;
}
