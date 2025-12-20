export function getTestCssPath(filename = 'tailwind.css') {
  return new URL(`./fixtures/${filename}`, import.meta.url).pathname;
}

export const mockCanonicalizations = {
  'w-[16px]': 'w-4',
  'h-[32px]': 'h-8',
  'bg-[#fff]': 'bg-white',
  'bg-[#000]': 'bg-black',
  'p-[4px]': 'p-1',
  'm-[8px]': 'm-2',
  'w-[20px]': 'w-5',
};

