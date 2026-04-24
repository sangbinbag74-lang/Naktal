declare module "pg-copy-streams" {
  import { Readable, Writable } from "stream";
  export function to(sql: string): Readable;
  export function from(sql: string): Writable;
}
